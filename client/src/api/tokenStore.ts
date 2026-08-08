/**
 * The access token lives in a module variable, not in localStorage.
 *
 * Anything in localStorage is readable by any script on the page, so a single XSS bug
 * would leak a long-lived credential an attacker could take away and reuse. Keeping the
 * token in memory means it dies with the tab, and the *refresh* token — which is the thing
 * worth stealing — sits in an HTTP-only cookie that page scripts cannot read at all.
 *
 * The cost is that a page reload starts with no access token. That is handled by calling
 * `/auth/refresh` once during app bootstrap: the cookie is still there, so the session is
 * restored before the first render that depends on it.
 *
 * Subscribers exist so non-React consumers (the Socket.IO clients) can pick up a rotated
 * token without re-reading a global on every use.
 */

let accessToken: string | null = null;
/** Epoch ms at which the current token expires; used to refresh proactively. */
let expiresAt = 0;

type Listener = (token: string | null) => void;
const listeners = new Set<Listener>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null, expiresInSec?: number): void {
  accessToken = token;
  expiresAt = token && expiresInSec ? Date.now() + expiresInSec * 1000 : 0;
  listeners.forEach((listener) => listener(token));
}

export function clearAccessToken(): void {
  setAccessToken(null);
}

/**
 * True when the token is absent or within `skewSec` of expiry. Lets the request
 * interceptor refresh *before* sending a doomed request instead of paying a round trip to
 * learn it is expired.
 */
export function isAccessTokenStale(skewSec = 30): boolean {
  if (!accessToken) return true;
  if (!expiresAt) return false;
  return Date.now() >= expiresAt - skewSec * 1000;
}

export function onAccessTokenChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Read the CSRF token the server set in a readable cookie. Echoed back in the
 * `X-CSRF-Token` header on cookie-authenticated requests (`/auth/refresh`, `/auth/logout`)
 * — the double-submit pattern. An attacker on another origin can make the browser *send*
 * the cookie but cannot read it to build this header.
 */
export function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)nh_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}
