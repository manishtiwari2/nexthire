const { authConfig } = require('./authConfig');
const { randomToken } = require('./tokenService');

/**
 * Real GitHub OAuth 2.0.
 *
 * Unlike Google, GitHub is **not** an OpenID Connect provider: there is no ID token, so
 * there is nothing signed for us to verify offline and no browser-side flow equivalent to
 * Google Identity Services. The authorization-code flow is the only option, and every
 * profile fact is read by *this server* from the GitHub API using an access token the
 * browser never sees.
 *
 * That shapes two things:
 *
 *  • `state` carries the whole CSRF burden (no `nonce`, because no token is replayable).
 *  • Email trust has to be established explicitly. GitHub will happily report an
 *    *unverified* address, and treating one as proof of ownership would let anyone add
 *    someone else's address to a throwaway GitHub account and inherit their NextHire
 *    account. `fetchProfile` therefore only ever returns an address GitHub has marked
 *    `verified: true` — this is the direct counterpart of Google's `email_verified` check.
 */

/** GitHub API requests without a User-Agent are rejected outright. */
const USER_AGENT = 'NextHire-Auth';
/** Pinning the API version keeps a future GitHub default from changing our payloads. */
const API_VERSION = '2022-11-28';
/** Neither call should be able to hang an inbound request indefinitely. */
const REQUEST_TIMEOUT_MS = 10_000;

class GithubAuthError extends Error {
  constructor(message, code = 'GITHUB_AUTH_FAILED') {
    super(message);
    this.name = 'GithubAuthError';
    this.code = code;
  }
}

function assertConfigured() {
  if (!authConfig.github.isConfigured) {
    throw new GithubAuthError(
      'GitHub sign-in is not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.',
      'GITHUB_NOT_CONFIGURED'
    );
  }
}

/**
 * JSON fetch with a timeout, mapping transport failures onto GithubAuthError so callers
 * only ever have to handle one error type.
 */
async function fetchJson(url, options, { errorCode }) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err.name === 'TimeoutError' ? 'timed out' : err.message;
    throw new GithubAuthError(`Could not reach GitHub (${reason})`, 'GITHUB_UNREACHABLE');
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = body?.message || `HTTP ${response.status}`;
    throw new GithubAuthError(`GitHub request failed: ${detail}`, errorCode);
  }
  return body;
}

// ---------------------------------------------------------------------------
// Authorization-code flow
// ---------------------------------------------------------------------------

/**
 * Opaque `state` for CSRF. Stored in a short-lived HTTP-only cookie and re-checked in the
 * callback. No `nonce`: GitHub issues no ID token, so there is no token replay to guard.
 */
function createOAuthState() {
  return { state: randomToken(16) };
}

/**
 * Build the GitHub consent URL.
 * @param {{ state: string, loginHint?: string }} params
 */
function buildAuthUrl({ state, loginHint }) {
  assertConfigured();

  const params = new URLSearchParams({
    client_id: authConfig.github.clientId,
    redirect_uri: authConfig.github.redirectUri,
    scope: authConfig.github.scope,
    state,
    // Without this GitHub silently reuses an existing authorization, which on a shared
    // machine signs the *previous* user back in. Matches `prompt=select_account` on Google.
    allow_signup: 'true',
  });
  if (loginHint) params.set('login', loginHint);

  return `${authConfig.github.oauthBaseUrl}/login/oauth/authorize?${params.toString()}`;
}

/**
 * Exchange an authorization code for a user access token.
 *
 * GitHub answers a *rejected* code with HTTP 200 and an `error` field rather than a 4xx,
 * so checking the status alone would let a bad code through as a successful exchange.
 */
async function exchangeCode(code) {
  assertConfigured();

  const body = await fetchJson(
    `${authConfig.github.oauthBaseUrl}/login/oauth/access_token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        // Default is form-urlencoded; ask for JSON explicitly.
        Accept: 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: new URLSearchParams({
        client_id: authConfig.github.clientId,
        client_secret: authConfig.github.clientSecret,
        code,
        redirect_uri: authConfig.github.redirectUri,
      }).toString(),
    },
    { errorCode: 'GITHUB_EXCHANGE_FAILED' }
  );

  if (body?.error) {
    throw new GithubAuthError(
      `GitHub token exchange failed: ${body.error_description || body.error}`,
      'GITHUB_EXCHANGE_FAILED'
    );
  }
  if (!body?.access_token) {
    throw new GithubAuthError('GitHub returned no access token', 'GITHUB_EXCHANGE_FAILED');
  }

  return { accessToken: body.access_token, scope: body.scope || '' };
}

/** Authenticated GET against the GitHub API. */
function apiGet(path, accessToken, errorCode) {
  return fetchJson(
    `${authConfig.github.apiBaseUrl}${path}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': API_VERSION,
        'User-Agent': USER_AGENT,
      },
    },
    { errorCode }
  );
}

/**
 * Pick the address we are willing to treat as proof of mailbox ownership.
 *
 * Preference order is primary-and-verified, then any verified address. An unverified
 * address is never a candidate — not even when it is the only one — because the whole
 * account-linking rule downstream rests on this being trustworthy.
 */
function selectVerifiedEmail(emails) {
  if (!Array.isArray(emails)) return null;
  const verified = emails.filter((entry) => entry?.verified === true && entry?.email);
  const chosen = verified.find((entry) => entry.primary === true) || verified[0];
  return chosen ? String(chosen.email).trim().toLowerCase() : null;
}

/**
 * Read the profile behind an access token and return a normalised, trusted shape.
 *
 * @returns {Promise<{
 *   githubId: string, email: string, emailVerified: boolean,
 *   name: string|null, login: string, picture: string|null, profileUrl: string|null
 * }>}
 */
async function fetchProfile(accessToken) {
  const user = await apiGet('/user', accessToken, 'GITHUB_PROFILE_FAILED');
  if (!user?.id) {
    throw new GithubAuthError('GitHub profile has no account id', 'GITHUB_PROFILE_FAILED');
  }

  // `/user`.email is the *public profile* email, which may be null or an address the user
  // never confirmed. `/user/emails` is the only source that reports verification status,
  // so a failure here is fatal rather than a reason to fall back to the profile field.
  let emails;
  try {
    emails = await apiGet('/user/emails', accessToken, 'GITHUB_EMAIL_FAILED');
  } catch (err) {
    if (err instanceof GithubAuthError && err.code === 'GITHUB_EMAIL_FAILED') {
      throw new GithubAuthError(
        'Could not read your GitHub email addresses. The OAuth app needs the "user:email" scope.',
        'GITHUB_EMAIL_SCOPE_MISSING'
      );
    }
    throw err;
  }

  const email = selectVerifiedEmail(emails);
  if (!email) {
    throw new GithubAuthError(
      'Your GitHub account has no verified email address. Verify one on GitHub, then try again.',
      'GITHUB_EMAIL_UNVERIFIED'
    );
  }

  return {
    githubId: String(user.id),
    email,
    emailVerified: true,
    name: user.name || user.login || null,
    login: String(user.login || ''),
    picture: user.avatar_url || null,
    profileUrl: user.html_url || (user.login ? `https://github.com/${user.login}` : null),
  };
}

/** `exchangeCode` + `fetchProfile`, mirroring the shape googleService returns. */
async function exchangeCodeForProfile(code) {
  const { accessToken, scope } = await exchangeCode(code);
  const profile = await fetchProfile(accessToken);
  return { profile, accessToken, scope };
}

module.exports = {
  GithubAuthError,
  createOAuthState,
  buildAuthUrl,
  exchangeCode,
  fetchProfile,
  exchangeCodeForProfile,
  // exported for tests
  selectVerifiedEmail,
};
