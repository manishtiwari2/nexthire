# NextHire — Security Report

> Last reviewed 2026-07-31. Findings marked **[verified]** were reproduced against a running
> instance with the committed schema and a live PostgreSQL database.

## Severity summary

| # | Finding | Severity | Verified |
|---|---------|----------|----------|
| S1 | Untrusted code executed via `node:vm` on the API process | **Critical** | design |
| S2 | Passwordless authentication / account auto-creation | **Critical** | ✅ |
| S3 | Hardcoded admin email allowlist | **High** | ✅ |
| S4 | Google OAuth credential decoded but never verified | **Critical** | design |
| S5 | Public question detail leaks hidden test cases + editorial solution | **High** | ✅ |
| S6 | Public contest detail leaks invite codes + participant PII | **High** | ✅ |
| S7 | IDOR: any user can read any submission by id | **High** | design |
| S8 | Committed secret: `.env` with real `JWT_SECRET` in VCS | **High** | ✅ |
| S9 | Dev fallback JWT secret when env unset (non-prod) | Medium | code |
| S10 | Raw internal error messages returned to clients (info disclosure) | Medium | ✅ |
| S11 | No input validation (zod unused); no rate limiting | Medium | code |
| S12 | No Socket.IO room-membership authorization | Medium | code |
| S13 | No security headers (helmet), permissive-ish CORS, no HTTPS | Medium | code |
| S14 | No refresh/rotation/revocation; 7-day tokens in `localStorage` (XSS-exfiltratable) | Medium | code |

## Details & remediation

### S1 — Untrusted code execution (Critical)
`executionEngine.js`/`judgeWorker.js` run submitted JavaScript with `vm.runInContext`. `node:vm`
is explicitly **not a security sandbox** (a determined payload can escape or exhaust resources),
and it runs inside the main API process, so a malicious/heavy submission can block the event loop
or crash the server. Python/C++/Java are stubs (no execution), so the risk is JS today, but the
architecture invites danger the moment real execution is added.
**Fix**: move execution to an isolated, resource-limited sandbox (container/microVM/`isolated-vm`)
in a separate process/service with CPU/memory/time limits and no network.

### S2 — Passwordless auth [verified] (Critical)
`POST /auth/login` (and its `register` alias) create an account for any unknown email and issue a
JWT **without any password check** — the schema has no password column at all.
Repro: `POST /auth/login {"email":"anuradha@admin.at"}` → valid **ADMIN** token.
**Fix**: add `passwordHash` + bcrypt verify, or commit to verified OAuth only; remove auto-create.

### S3 — Hardcoded admin allowlist [verified] (High)
`determineRole()` grants ADMIN to `anuradha@admin.at` / `manish@admin.mt`. Combined with S2, an
attacker who registers/logs in with those emails becomes admin. **Fix**: assign roles out-of-band
(seeded/admin action), not by email string.

### S4 — Unverified Google credential (Critical)
`authController.googleLogin` uses `jwt.decode(credential)` (no signature verification) and trusts
the embedded email/sub. A forged JWT with any `email` is accepted. **Fix**: verify the Google ID
token against Google's JWKS and audience (`google-auth-library`).

### S5 — Hidden test cases + editorial exposed [verified] (High)
`GET /questions/:id` is unauthenticated and returns **all** test cases (including non-sample) and
the full editorial solution. Repro (anonymous): seeded a hidden case + editorial, then fetched the
endpoint and received `SECRET_HIDDEN_INPUT`, `SECRET_EXPECTED_ANSWER`, and the full solution
source. **Fix**: require auth; return only `isSample` cases and omit editorial solution to
non-admins/non-owners. *(Fixed in this pass — see Issues Fixed.)*

### S6 — Contest invite codes + PII exposed [verified] (High)
`GET /contests/:id` is unauthenticated and returns invite codes and participant user objects
(emails). Repro (anonymous): received `["DSA-WXNCMT"]` and `["alice@example.com"]`.
**Fix**: require auth; expose invites only to host/admin; return minimal participant fields.
*(Fixed in this pass.)*

### S7 — Submission IDOR (High)
`GET /questions/submission/:submissionId` returns any submission (including its `code`) without
checking ownership. **Fix**: filter by `userId === req.user.id` (or admin). *(Fixed in this pass.)*

### S8 — Committed secret [verified] (High)
`.env` is committed and contains a real `JWT_SECRET` (and DB creds). `.gitignore` lists `.env`
but it is already tracked. **Fix**: `git rm --cached .env`, rotate the secret and DB password,
keep only `.env.example`. *(Cannot rotate for you; documented + recommend history purge.)*

### S9 — Dev fallback secret (Medium)
`authMiddleware` falls back to `'nexthire_dev_secret_key_2026'` if `JWT_SECRET` is unset and
`NODE_ENV !== 'production'`. Note this **differs** from the committed `.env` value and from the
`authController`'s independent default string — an inconsistency that can cause confusing token
failures. **Fix**: single source of truth; fail fast if unset in any deployed environment.

### S10 — Raw error disclosure [verified] (Medium)
Controllers return `err.message` (e.g. Prisma errors) to clients. **Fix**: log server-side, return
generic messages + error codes.

### S11 — No validation / rate limiting (Medium)
`zod` is installed but unused; bodies are trusted. No rate limiting on auth or submit endpoints.
**Fix**: validate at the boundary; add `express-rate-limit` on auth/execute/submit.

### S12 — Socket room authz (Medium)
Any authenticated socket can `join-room` on any `roomCode` and receive its code/chat. **Fix**:
verify the user is a participant of the contest/interview the room maps to.

### S13 — Transport/headers (Medium)
No `helmet`, no HTTPS, `/uploads` served with no auth. CORS is restricted to `CLIENT_URL` (good)
but methods are broad. **Fix**: add helmet, TLS termination, tighten CORS.

### S14 — Token handling (Medium)
7-day JWTs in `localStorage` are exfiltratable via XSS and cannot be revoked. **Fix**: shorter
access tokens + refresh rotation, httpOnly cookie option, and a revocation list for logout.

## Positive notes
- Authorization middleware correctly gates admin/host **mutation** routes.
- Socket handshake requires a valid JWT.
- `express.json` body size capped at 1mb.
- Self-role-escalation via `register {role:"ADMIN"}` is **not** possible (param ignored) [verified].
