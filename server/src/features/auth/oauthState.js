const { authConfig } = require('./authConfig');

/**
 * The short-lived cookie that carries an in-flight OAuth handshake.
 *
 * A provider redirect arrives as a top-level cross-site GET, so there is no request body
 * and no header we control — the only way to recognise our own handshake is a cookie we set
 * before sending the user away. It holds:
 *
 *  • `provider` — which flow this is. Checked in the callback so a handshake started for one
 *    provider cannot be completed by the other: without it, an attacker who can make a
 *    victim's browser start a Google sign-in could feed the resulting cookie to the GitHub
 *    callback (or the reverse) and have `state` still match.
 *  • `state` — the CSRF value echoed back by the provider.
 *  • `nonce` — ID-token replay protection. Google only; GitHub issues no ID token.
 *  • `redirect` — where to land in the SPA. Already narrowed to a relative path by the
 *    caller, so it cannot become an open redirect.
 *  • `rememberMe` — the sign-in page's checkbox, which has nowhere else to survive the
 *    round trip to the provider.
 *
 * `sameSite: 'lax'` is required, not a preference: a `strict` cookie is withheld on exactly
 * the cross-site navigation this exists to survive, so every callback would fail.
 */

const COOKIE_NAME = 'nh_oauth';
const TTL_MS = 10 * 60 * 1000;

function cookieOptions() {
  return {
    httpOnly: true,
    secure: authConfig.cookies.secure,
    sameSite: 'lax',
    domain: authConfig.cookies.domain,
    path: '/',
  };
}

/**
 * @param {import('express').Response} res
 * @param {{ provider: 'google'|'github', state: string, nonce?: string, redirect: string, rememberMe: boolean }} payload
 */
function issueOAuthState(res, payload) {
  res.cookie(COOKIE_NAME, JSON.stringify(payload), { ...cookieOptions(), maxAge: TTL_MS });
}

function clearOAuthState(res) {
  res.clearCookie(COOKIE_NAME, cookieOptions());
}

/**
 * Read and validate the handshake cookie against the provider's callback query.
 *
 * @param {import('express').Request} req
 * @param {'google'|'github'} provider
 * @returns {{ ok: true, value: object } | { ok: false, code: string, message: string }}
 */
function consumeOAuthState(req, provider) {
  let stored;
  try {
    stored = JSON.parse(req.cookies?.[COOKIE_NAME] || 'null');
  } catch {
    stored = null;
  }

  if (!stored?.state) {
    return {
      ok: false,
      code: 'OAUTH_STATE_MISSING',
      message: 'Your sign-in attempt expired. Please try again.',
    };
  }

  // A handshake started for a different provider is not ours to finish. Cookies set before
  // this field existed have no `provider`; treat that as a mismatch rather than trusting it.
  if (stored.provider !== provider) {
    return {
      ok: false,
      code: 'OAUTH_PROVIDER_MISMATCH',
      message: 'Sign-in verification failed. Please try again.',
    };
  }

  if (typeof req.query.state !== 'string' || req.query.state !== stored.state) {
    return {
      ok: false,
      code: 'OAUTH_STATE_MISMATCH',
      message: 'Sign-in verification failed. Please try again.',
    };
  }

  return { ok: true, value: stored };
}

/**
 * Narrow a caller-supplied post-login path to a safe relative route.
 * Rejects absolute URLs and `//host` protocol-relative forms, which would otherwise make
 * every OAuth entry point an open redirect.
 */
function safeRedirectPath(requested, fallback = '/dashboard') {
  return typeof requested === 'string' && /^\/[^/\\]/.test(requested) ? requested : fallback;
}

module.exports = {
  OAUTH_STATE_COOKIE: COOKIE_NAME,
  OAUTH_STATE_TTL_MS: TTL_MS,
  issueOAuthState,
  clearOAuthState,
  consumeOAuthState,
  safeRedirectPath,
};
