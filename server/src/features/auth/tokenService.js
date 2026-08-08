const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { authConfig } = require('./authConfig');
const { normalizeRole } = require('../../shared/authz');

/**
 * Token primitives.
 *
 * Access token  — short-lived signed JWT, sent in the `Authorization` header. Carries
 *                 `tv` (tokenVersion) and `sid` (session id) so a logout / password
 *                 change / role change can invalidate tokens that have not yet expired.
 * Refresh token — opaque 256-bit random string. Only its sha256 is persisted, so the
 *                 database alone cannot be used to mint sessions. Rotated on every use.
 * Email tokens  — same opaque + hashed design, single use, short TTL.
 */

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** sha256 is the right primitive here: the input is already high-entropy random. */
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/** Timing-safe equality for comparing hashes/CSRF tokens. */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a ?? ''));
  const bufB = Buffer.from(String(b ?? ''));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Mint an access token. Deliberately minimal: no email/name beyond what the API needs to
 * authorize, and never anything sensitive — a JWT payload is readable by anyone holding it.
 */
function signAccessToken({ userId, email, role, tokenVersion, sessionId }) {
  return jwt.sign(
    {
      sub: userId,
      email,
      role: normalizeRole(role),
      tv: tokenVersion ?? 0,
      sid: sessionId,
    },
    authConfig.accessTokenSecret,
    {
      expiresIn: authConfig.accessTokenTtlSec,
      issuer: authConfig.jwtIssuer,
      audience: authConfig.jwtAudience,
    }
  );
}

/**
 * Verify an access token's signature, expiry, issuer and audience.
 * @returns {{ok: true, payload: object} | {ok: false, reason: 'expired'|'invalid'}}
 */
function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, authConfig.accessTokenSecret, {
      issuer: authConfig.jwtIssuer,
      audience: authConfig.jwtAudience,
    });
    return { ok: true, payload };
  } catch (err) {
    return { ok: false, reason: err.name === 'TokenExpiredError' ? 'expired' : 'invalid' };
  }
}

/**
 * Create a refresh token plus the values persisted alongside it.
 * The raw token is returned once, to be written straight into an HTTP-only cookie.
 */
function createRefreshToken({ rememberMe = false } = {}) {
  const token = randomToken(32);
  const ttlSec = rememberMe
    ? authConfig.refreshTokenRememberTtlSec
    : authConfig.refreshTokenTtlSec;
  return {
    token,
    tokenHash: hashToken(token),
    ttlSec,
    expiresAt: new Date(Date.now() + ttlSec * 1000),
  };
}

/** Email verification / password reset token: raw goes in the link, hash goes in the DB. */
function createEmailToken(ttlSec) {
  const token = randomToken(32);
  return {
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlSec * 1000),
  };
}

function createCsrfToken() {
  return randomToken(16);
}

module.exports = {
  randomToken,
  hashToken,
  safeEqual,
  signAccessToken,
  verifyAccessToken,
  createRefreshToken,
  createEmailToken,
  createCsrfToken,
};
