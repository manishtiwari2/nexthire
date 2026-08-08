const { authConfig } = require('./authConfig');
const { createCsrfToken, safeEqual } = require('./tokenService');

/**
 * Refresh-token and CSRF cookie handling.
 *
 * The refresh token lives in an HTTP-only cookie so page JavaScript (and therefore any
 * XSS payload) cannot read it. Because a cookie is sent automatically, the two endpoints
 * that authenticate *by cookie* (`/refresh`, `/logout`) are CSRF-protected with the
 * double-submit pattern: a readable `nh_csrf` cookie that the client must echo back in
 * the `X-CSRF-Token` header. An attacker on another origin can cause the cookie to be
 * sent but cannot read it to set the header.
 */

const { refreshName, csrfName } = authConfig.cookies;

function baseOptions() {
  const { domain, secure, sameSite, path } = authConfig.cookies;
  return {
    domain,
    secure,
    sameSite,
    path,
  };
}

/**
 * @param {import('express').Response} res
 * @param {string} token raw refresh token
 * @param {{rememberMe?: boolean, ttlSec: number}} opts
 * @returns {string} the CSRF token that was issued alongside it
 */
function setAuthCookies(res, token, { rememberMe = false, ttlSec }) {
  const csrfToken = createCsrfToken();

  // Without "Remember me" the cookies are session cookies (no maxAge): closing the
  // browser ends the session. The server still enforces its own TTL independently.
  const persistence = rememberMe ? { maxAge: ttlSec * 1000 } : {};

  res.cookie(refreshName, token, {
    ...baseOptions(),
    ...persistence,
    httpOnly: true,
  });

  res.cookie(csrfName, csrfToken, {
    ...baseOptions(),
    ...persistence,
    httpOnly: false, // must be readable by the client to be echoed back
  });

  return csrfToken;
}

function clearAuthCookies(res) {
  const options = baseOptions();
  res.clearCookie(refreshName, { ...options, httpOnly: true });
  res.clearCookie(csrfName, { ...options, httpOnly: false });
}

function readRefreshToken(req) {
  return req.cookies?.[refreshName] || null;
}

/**
 * Express middleware for cookie-authenticated endpoints. Rejects when the CSRF cookie
 * and header disagree. Requests with no refresh cookie at all are let through so the
 * handler can return its own "no session" response rather than a confusing 403.
 */
function requireCsrfToken(req, res, next) {
  if (!readRefreshToken(req)) return next();

  const cookieToken = req.cookies?.[csrfName];
  const headerToken = req.headers[authConfig.csrfHeaderName];

  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    return res.status(403).json({
      success: false,
      error: 'CSRF token missing or invalid',
      code: 'CSRF_FAILED',
    });
  }
  return next();
}

module.exports = {
  setAuthCookies,
  clearAuthCookies,
  readRefreshToken,
  requireCsrfToken,
  refreshCookieName: refreshName,
  csrfCookieName: csrfName,
};
