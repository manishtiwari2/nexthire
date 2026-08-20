# ADR-0002: In-memory access token + rotating refresh cookie

## Status
Accepted.

## Context
A single-page app needs a bearer credential to call the API, plus a way to stay signed in across
page loads. Two threats dominate: **XSS token theft** (a script reading a token from browser storage)
and **refresh-token replay** (a leaked long-lived token reused by an attacker). The system also needs
to be able to revoke a session immediately (password change, disable, "log out everywhere").

## Decision
- **Access token:** a short-lived JWT (~15 min) with claims `{ sub, email, role, tv, sid }`, held by
  the client **in a JavaScript variable — never `localStorage`/`sessionStorage`**, and sent as
  `Authorization: Bearer`.
- **Refresh token:** an opaque token delivered as an **HttpOnly** cookie (`nh_rt`). The database
  stores only its **sha256 hash** (`Session.tokenHash`), so a DB leak cannot be replayed.
- **Rotation + reuse detection:** each refresh issues a new token and records the previous hash
  (`previousTokenHash`). Presenting a superseded token means the family was stolen → **all** of the
  user's sessions are revoked.
- **CSRF:** double-submit — a readable `nh_csrf` cookie must equal the `x-csrf-token` header on
  `POST /auth/refresh` and `POST /auth/logout`.
- **Immediate revocation:** `User.tokenVersion` is embedded in the access token as `tv` and
  re-checked on every request; bumping it (logout-all, password change/reset, disable, role change)
  invalidates outstanding access tokens at once.

## Alternatives considered
- **JWT in `localStorage`** — simplest, but readable by any XSS payload. Rejected.
- **Long-lived stateless JWT, no server state** — no revocation, no reuse detection. Rejected.
- **Server-side sessions only (cookie, no bearer)** — awkward for a token-based API and cross-origin
  calls; loses the stateless-request benefit of a signed access token.

## Rationale
Documented in the auth module comments (`userDto.js` allow-listing, `Session` model comments on
rotation/reuse, `authController.issueSession`). Splitting a short access token (cheap, stateless
checks) from a rotating refresh token (stateful, revocable) gives both fast requests and strong
control, while keeping nothing sensitive in browser storage.

## Consequences
- **Positive:** XSS cannot read the token from storage; a DB leak yields only hashes; stolen refresh
  tokens are caught on reuse; sessions are revocable immediately.
- **Negative / cost:** a full page reload starts with no access token and must perform a silent
  refresh to restore the session; more machinery (rotation, CSRF, per-request DB re-check).

## Future
None outstanding for the core design.
