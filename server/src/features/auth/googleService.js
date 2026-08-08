const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { authConfig } = require('./authConfig');
const { randomToken } = require('./tokenService');

/**
 * Real Google OAuth 2.0 / OpenID Connect.
 *
 * Two entry points, both ending in the *same* verification step:
 *
 *  1. Authorization-code flow (`buildAuthUrl` -> Google -> `exchangeCode`).
 *     Needs GOOGLE_CLIENT_SECRET. The browser only ever carries an opaque `code`.
 *  2. Google Identity Services flow (`verifyIdToken` on a GIS `credential`).
 *     Needs only GOOGLE_CLIENT_ID. Used by the one-tap / rendered button.
 *
 * In both cases the ID token is verified server-side against Google's published RSA keys
 * — signature, issuer, audience, expiry and `email_verified` are all checked here. No
 * field supplied by the client (email, name, picture, sub) is ever trusted; every value
 * used downstream comes out of the verified token payload.
 */

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/** Small clock tolerance so a slightly skewed server clock does not reject valid tokens. */
const CLOCK_TOLERANCE_SEC = 30;

class GoogleAuthError extends Error {
  constructor(message, code = 'GOOGLE_AUTH_FAILED') {
    super(message);
    this.name = 'GoogleAuthError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// JWKS cache
// ---------------------------------------------------------------------------

/** @type {{ keys: Map<string, string>, expiresAt: number }} */
let jwksCache = { keys: new Map(), expiresAt: 0 };

function parseMaxAge(cacheControl) {
  const match = /max-age=(\d+)/i.exec(cacheControl || '');
  if (!match) return 3600;
  return Math.min(Math.max(Number(match[1]) || 3600, 300), 86400);
}

/**
 * Fetch Google's signing keys and convert each JWK to a PEM public key.
 * Cached until the `Cache-Control: max-age` Google returns, then refetched.
 */
async function getGooglePublicKeys({ force = false } = {}) {
  if (!force && jwksCache.expiresAt > Date.now() && jwksCache.keys.size) {
    return jwksCache.keys;
  }

  const response = await fetch(JWKS_URL, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new GoogleAuthError(
      `Could not fetch Google signing keys (HTTP ${response.status})`,
      'GOOGLE_JWKS_UNAVAILABLE'
    );
  }

  const body = await response.json();
  const keys = new Map();
  for (const jwk of body.keys || []) {
    if (jwk.kty !== 'RSA' || !jwk.kid) continue;
    try {
      // Node can import a JWK directly, so no third-party JWK->PEM conversion is needed.
      const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
      keys.set(jwk.kid, publicKey.export({ type: 'spki', format: 'pem' }));
    } catch {
      // Skip keys this Node build cannot import rather than failing the whole set.
    }
  }

  if (!keys.size) {
    throw new GoogleAuthError('Google returned no usable signing keys', 'GOOGLE_JWKS_UNAVAILABLE');
  }

  jwksCache = {
    keys,
    expiresAt: Date.now() + parseMaxAge(response.headers.get('cache-control')) * 1000,
  };
  return keys;
}

// ---------------------------------------------------------------------------
// ID token verification
// ---------------------------------------------------------------------------

/**
 * Verify a Google ID token and return a normalised, trusted profile.
 *
 * @param {string} idToken
 * @param {{ expectedNonce?: string }} [opts]
 * @returns {Promise<{
 *   googleId: string, email: string, emailVerified: boolean,
 *   name: string|null, picture: string|null, hostedDomain: string|null
 * }>}
 */
async function verifyIdToken(idToken, { expectedNonce } = {}) {
  if (!authConfig.google.isConfigured) {
    throw new GoogleAuthError('Google sign-in is not configured on this server', 'GOOGLE_NOT_CONFIGURED');
  }
  if (typeof idToken !== 'string' || !idToken.includes('.')) {
    throw new GoogleAuthError('Malformed Google credential', 'GOOGLE_TOKEN_MALFORMED');
  }

  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded?.header?.kid) {
    throw new GoogleAuthError('Google credential is missing a key id', 'GOOGLE_TOKEN_MALFORMED');
  }
  if (decoded.header.alg !== 'RS256') {
    throw new GoogleAuthError('Unexpected Google token algorithm', 'GOOGLE_TOKEN_MALFORMED');
  }

  let keys = await getGooglePublicKeys();
  let pem = keys.get(decoded.header.kid);
  if (!pem) {
    // Google rotates keys; an unknown kid means our cache is stale, not that it is invalid.
    keys = await getGooglePublicKeys({ force: true });
    pem = keys.get(decoded.header.kid);
  }
  if (!pem) {
    throw new GoogleAuthError('Google credential was signed with an unknown key', 'GOOGLE_TOKEN_INVALID');
  }

  let payload;
  try {
    payload = jwt.verify(idToken, pem, {
      algorithms: ['RS256'],
      audience: authConfig.google.clientId,
      issuer: GOOGLE_ISSUERS,
      clockTolerance: CLOCK_TOLERANCE_SEC,
    });
  } catch (err) {
    const code = err.name === 'TokenExpiredError' ? 'GOOGLE_TOKEN_EXPIRED' : 'GOOGLE_TOKEN_INVALID';
    throw new GoogleAuthError(`Google credential rejected: ${err.message}`, code);
  }

  if (expectedNonce && payload.nonce !== expectedNonce) {
    throw new GoogleAuthError('Google credential nonce mismatch', 'GOOGLE_NONCE_MISMATCH');
  }
  if (!payload.sub) {
    throw new GoogleAuthError('Google credential has no subject', 'GOOGLE_TOKEN_INVALID');
  }
  if (!payload.email) {
    throw new GoogleAuthError('Google account did not share an email address', 'GOOGLE_NO_EMAIL');
  }
  // An unverified Google email must not be allowed to claim a local account with the
  // same address — that would be an account-takeover primitive.
  if (payload.email_verified !== true && payload.email_verified !== 'true') {
    throw new GoogleAuthError('Google has not verified this email address', 'GOOGLE_EMAIL_UNVERIFIED');
  }

  return {
    googleId: String(payload.sub),
    email: String(payload.email).trim().toLowerCase(),
    emailVerified: true,
    name: payload.name || payload.given_name || null,
    picture: payload.picture || null,
    hostedDomain: payload.hd || null,
  };
}

// ---------------------------------------------------------------------------
// Authorization-code flow
// ---------------------------------------------------------------------------

/** Opaque `state` + `nonce` pair; both are stored in a short-lived cookie and re-checked. */
function createOAuthState() {
  return { state: randomToken(16), nonce: randomToken(16) };
}

/**
 * Build the Google consent URL.
 * @param {{ state: string, nonce: string, loginHint?: string }} params
 */
function buildAuthUrl({ state, nonce, loginHint }) {
  if (!authConfig.google.supportsCodeFlow) {
    throw new GoogleAuthError(
      'Google authorization-code flow requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
      'GOOGLE_NOT_CONFIGURED'
    );
  }

  const params = new URLSearchParams({
    client_id: authConfig.google.clientId,
    redirect_uri: authConfig.google.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    // Always show the chooser: silent re-auth into the wrong account is a support burden.
    prompt: 'select_account',
    include_granted_scopes: 'true',
  });
  if (loginHint) params.set('login_hint', loginHint);

  return `${AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for tokens, then verify the returned ID token.
 * @returns {Promise<{ profile: object, accessToken: string|null, refreshToken: string|null }>}
 */
async function exchangeCode(code, { expectedNonce } = {}) {
  if (!authConfig.google.supportsCodeFlow) {
    throw new GoogleAuthError(
      'Google authorization-code flow is not configured',
      'GOOGLE_NOT_CONFIGURED'
    );
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: authConfig.google.clientId,
      client_secret: authConfig.google.clientSecret,
      redirect_uri: authConfig.google.redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.id_token) {
    const reason = body.error_description || body.error || `HTTP ${response.status}`;
    throw new GoogleAuthError(`Google token exchange failed: ${reason}`, 'GOOGLE_EXCHANGE_FAILED');
  }

  const profile = await verifyIdToken(body.id_token, { expectedNonce });
  return {
    profile,
    accessToken: body.access_token || null,
    refreshToken: body.refresh_token || null,
  };
}

/** Best-effort revocation of a Google access token when a user unlinks their account. */
async function revokeGoogleToken(token) {
  if (!token) return false;
  try {
    const response = await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
    return response.ok;
  } catch {
    return false;
  }
}

module.exports = {
  GoogleAuthError,
  verifyIdToken,
  createOAuthState,
  buildAuthUrl,
  exchangeCode,
  revokeGoogleToken,
  getGooglePublicKeys,
};
