# API Reference

> Verified against the route and controller sources under [`server/src/features/`](../server/src/features/).
> Endpoints, permission gates, and response envelopes below reflect what is **implemented**.
> No secrets, tokens, or credentials appear in this document.

## Overview

NextHire exposes a JSON REST API plus a Socket.IO channel for live judge verdicts.

- **Base path:** every route is mounted twice — the canonical `/api/v1/...` and a
  backward-compatible unversioned alias `/api/...`. Prefer `/api/v1`.
- **Content type:** `application/json`. Request bodies are limited to **1 MB** (`express.json({ limit: '1mb' })`).
- **Health check:** `GET /api/health` → `{ status: 'ok', service, timestamp }` (unauthenticated).
- **OpenAPI:** `GET /docs` serves an OpenAPI view **in non-production only**.

### Response envelope

Success and error bodies are consistent:

```jsonc
// success
{ "success": true, "data": { /* ... */ } }

// list endpoints add a sibling pagination object
{ "success": true, "data": [ /* ... */ ], "pagination": { "total": 148, "page": 1, "limit": 10, "totalPages": 15 } }

// error
{ "success": false, "error": "Human-readable message", "code": "MACHINE_CODE" }
```

In **production**, unhandled errors return a generic message (`"Something went wrong. Please try again."`) with code `INTERNAL_ERROR`; internal details are logged, never shipped. In development the real message is returned.

## Authentication model

NextHire uses a **short-lived access token + rotating refresh cookie** design. See
[SYSTEM_DESIGN.md](SYSTEM_DESIGN.md#authentication--session-security) and
[ADR-0002](decisions/0002-in-memory-access-token-rotating-refresh.md) for the rationale.

- **Access token** — a JWT with claims `{ sub, email, role, tv (tokenVersion), sid (sessionId) }`,
  TTL `ACCESS_TOKEN_TTL_SEC` (default 900s). Sent on protected requests as
  `Authorization: Bearer <token>`. The reference client holds it **in memory only** (never
  `localStorage`).
- **Refresh token** — delivered as an **HttpOnly** cookie (`nh_rt`), never in a response body.
  Each use **rotates** it: the old hash is remembered and, if presented again, the whole session
  family is revoked (reuse detection). TTL is `REFRESH_TOKEN_TTL_SEC` (7d) or the remember-me TTL
  (30d).
- **CSRF** — a readable `nh_csrf` cookie is paired with an `x-csrf-token` request header
  (double-submit). Required on the cookie-authenticated state-changing endpoints
  **`POST /auth/refresh`** and **`POST /auth/logout`**.
- **Per-request revalidation** — every authenticated request re-checks the DB: the account must be
  active, the token's `tv` must match the user's current `tokenVersion`, and the session must not
  be revoked/expired. Logout-all, password change, disable, and role change all bump `tokenVersion`
  and immediately invalidate outstanding access tokens.

### Authorization (permissions)

Routes declare a **permission**, not a role. Roles map to permissions in
[`server/src/shared/authz.js`](../server/src/shared/authz.js):

| Role | Permissions |
|---|---|
| Guest (unauthenticated) | `public:read` |
| `USER` | guest + `practice:use`, `contest:participate`, `notes:manage`, `progress:read`, `sheet:read`, `sheet:manage-own`, `revision:use`, `submission:create`, `profile:manage` |
| `ADMIN` | user + `question:manage`, `contest:manage`, `user:manage`, `analytics:read`, `submission:manage` |

Effective `ADMIN` is re-derived from the `ADMIN_EMAILS` config on every sign-in. `GET /auth/me`
returns the caller's resolved `permissions` array so the UI never recomputes the matrix.

Common middleware referenced in the tables below:
- **`attachUser`** — soft auth: personalises the response if a valid token is present, still serves guests.
- **`requireAuthenticated`** — rejects without a valid access token (`401`).
- **`requireEmailVerified`** — additionally requires a verified email (`403`) for endpoints that create durable state.
- **`requirePermission(x)`** — rejects if the role lacks permission `x` (`403`).

## Conventions

### Pagination
List endpoints accept `page` (1-based) and `limit`. `limit` is capped server-side:
- Questions browse: default **10**, max **100**.
- Submissions list: default **20**, max **100**.

Responses carry a sibling `pagination: { total, page, limit, totalPages }`.

### Rate limiting
An in-memory fixed-window limiter (`server/src/shared/rateLimit.js`) guards auth endpoints,
keyed by IP (and by IP+email on credential endpoints). Responses include `X-RateLimit-Limit`
and `X-RateLimit-Remaining`; on exhaustion the API returns **`429`** with code `RATE_LIMITED`
and a `Retry-After` header. (`DISABLE_RATE_LIMIT=1` turns it off for tests.)

| Endpoint | Limit / window |
|---|---|
| `POST /auth/login` | 10 / 5 min (per IP+email) |
| `POST /auth/register` | 5 / hour (per IP, after validation) |
| `POST /auth/resend-verification`, `/forgot-password` | 5 / 15 min (per IP+email) |
| `POST /auth/verify-email`, `/reset-password`, `/change-password` | 10 / 15 min (per IP) |
| `POST /auth/refresh` | 60 / 5 min (per IP) |
| `POST /auth/google`, GitHub/Google flows | 20 / 5 min (per IP, separate buckets) |

### Common error codes
`NOT_FOUND`, `INTERNAL_ERROR`, `RATE_LIMITED`, `INVALID_FILTER`, `INVALID_CODE`, `CODE_TOO_LARGE`,
`TOKEN_EXPIRED`, `TOKEN_USED`, `TOKEN_MISSING`. Validation failures return `400` with field details.

---

## Auth — `/api/v1/auth`

### Public

| Method | Path | Body / notes | Response `data` |
|---|---|---|---|
| GET | `/config` | — | `{ googleEnabled, githubEnabled, passwordPolicy, accessTokenTtlSec, ... }` |
| POST | `/register` | `{ name, email, mobile, password }` | `{ user, emailVerificationRequired, message }` (does **not** sign in) |
| POST | `/login` | `{ email, password, rememberMe? }` | `{ accessToken, expiresIn, sessionId, user }` + sets `nh_rt`/`nh_csrf` cookies |
| POST | `/verify-email` | `{ token }` | `{ verified: true, message }` |
| POST | `/resend-verification` | `{ email }` | generic `{ message }` (no account enumeration) |
| POST | `/forgot-password` | `{ email }` | generic `{ message }` |
| POST | `/reset-password` | `{ token, password }` | `{ message }` |
| POST | `/google` | `{ credential }` (Google ID token) | `{ accessToken, expiresIn, sessionId, user, isNewAccount, accountLinked }` |
| GET | `/google/start` · `/google/callback` | OAuth authorization-code flow (browser navigation) | redirects to client with token in URL fragment |
| GET | `/github/start` · `/github/callback` | GitHub authorization-code flow (server-side exchange) | redirects to client |
| POST | `/refresh` | **CSRF required**; refresh cookie sent automatically | `{ accessToken, expiresIn, sessionId, user }` + rotated cookie |
| POST | `/logout` | **CSRF required** | `{ message: 'Signed out' }` |

### Authenticated

| Method | Path | Permission | Response `data` |
|---|---|---|---|
| GET | `/me` | authenticated | `{ user, sessionId, emailVerificationRequired }` |
| POST | `/logout-all` | authenticated | `{ message, revokedSessions }` (bumps `tokenVersion`) |
| GET | `/sessions` | authenticated | `{ sessions: [...] }` (device list) |
| DELETE | `/sessions/:id` | authenticated | `{ message, wasCurrentSession }` |
| GET | `/security-events` | authenticated | `{ events: [...] }` (security timeline) |
| PATCH | `/profile` | `profile:manage` | `{ user }` |
| POST | `/change-password` | authenticated | `{ ... }` (bumps `tokenVersion`) |
| POST | `/google/unlink` · `/github/unlink` | authenticated | `{ user }` |

### Admin — `user:manage` (analytics: `analytics:read`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/users` | List/search users (paginated) |
| GET | `/admin/users/:id` | User detail |
| GET | `/admin/users/:id/login-history` | That user's auth events |
| PATCH | `/admin/users/:id/status` | Enable/disable an account |
| POST | `/admin/users/:id/reset-password` | Send a reset link |
| POST | `/admin/users/:id/unlock` | Clear a lockout |
| POST | `/admin/users/:id/revoke-sessions` | Force sign-out everywhere |
| GET | `/admin/analytics` | Auth analytics (`analytics:read`) |

**Example — login**

```http
POST /api/v1/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "••••••••", "rememberMe": true }
```
```jsonc
// 200
{ "success": true, "data": {
  "accessToken": "<jwt>", "expiresIn": 900, "sessionId": "<uuid>",
  "user": { "id": "...", "email": "user@example.com", "role": "USER",
            "permissions": ["public:read", "practice:use", "..."],
            "emailVerified": true, "hasPassword": true, "googleLinked": false }
} }
// Set-Cookie: nh_rt=<opaque>; HttpOnly; ...    nh_csrf=<token>; ...
```

---

## Questions — `/api/v1/questions`

| Method | Path | Gate | Notes |
|---|---|---|---|
| GET | `/topics` | public | Topic list. |
| GET | `/` | `attachUser` | Browse/search the library. Filters: `topic`, `difficulty`, `source`, `frequency`, `company`, `search`, `solvable=true\|false`, plus (signed-in) `solved`/`bookmarked`/revision-due. Paginated (default 10, max 100). |
| GET | `/:id` | authenticated | Question detail. **Hidden (non-sample) test cases are stripped for non-admins.** Includes `personal` progress for the caller. |
| GET | `/:id/submissions` | authenticated | The caller's submissions for this question. |
| POST | `/` | `question:manage` | Create a question (admin). |
| PUT | `/:id` | `question:manage` | Update. |
| DELETE | `/:id` | `question:manage` | Delete. |
| POST | `/:id/execute` | verified + `submission:create` | **Run or Submit** code (see below). |
| GET | `/submission/:submissionId` | authenticated | Verdict for a submission (IDOR-checked; hidden-case I/O stripped for non-admins). |

**Example — Run vs Submit** (`context`/`contestId` are ignored here and pinned to `PRACTICE`):

```http
POST /api/v1/questions/<questionId>/execute
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "code": "def solve(...): ...", "language": "PYTHON", "mode": "run" }
```
```jsonc
// 200 — the verdict is delivered asynchronously (Socket.IO or by polling the submission)
{ "success": true, "data": { "submissionId": "<uuid>", "jobId": "<uuid>", "status": "QUEUED", "mode": "run" } }
```
- `mode: "run"` → judged against **sample** cases only; excluded from history; no progress/score effects.
- `mode: "submit"` (or omitted) → judged against **all** cases; records progress and (in a contest) score.
- `language` must be one of the executable languages (`PYTHON`, `CPP`, `JAVA`); others → `400`.
- `code` must be a string (`400 INVALID_CODE`) within the size limit (`413 CODE_TOO_LARGE`).

---

## Submissions — `/api/v1/submissions`

All require authentication; ownership is enforced per record (a user reads/cancels only their own; admins read any).

| Method | Path | Gate | Notes |
|---|---|---|---|
| GET | `/` | authenticated | List the caller's submissions (paginated, default 20, max 100; trial runs excluded). |
| GET | `/:id` | authenticated | Submission + latest execution (IDOR-checked, hidden-case-safe). |
| GET | `/:id/result` | authenticated | Latest execution result only. |
| POST | `/:id/rejudge` | `submission:manage` | Re-enqueue for judging (admin). |
| POST | `/:id/cancel` | authenticated (owner) | Cancel a `PENDING` submission; rejects if already running/terminal. |

---

## Contests — `/api/v1/contests`

| Method | Path | Gate | Notes |
|---|---|---|---|
| GET | `/` | `attachUser` | List contests (guest-safe projection; no problem statements). |
| GET | `/:id` | authenticated | Contest detail; invite codes scoped to host/admin. |
| GET | `/:id/leaderboard` | `attachUser` | Ranked participants (score DESC, penalty ASC). |
| POST | `/` | verified + `contest:manage` | Create a contest. |
| POST | `/:id/join` | verified + `contest:participate` | Join a contest. |
| POST | `/join-by-code` | verified + `contest:participate` | Join via invite `code` (enforces `maxUses`/expiry). |
| POST | `/:id/heartbeat` | `contest:participate` | Liveness ping (records `lastHeartbeatAt`). |
| POST | `/:id/submit` | verified + `contest:participate` | Submit within the contest window; server sets `context=CONTEST` and awards points on first `ACCEPTED`. |
| POST | `/:id/invites` | verified + host | Create an invite code (CSPRNG-generated). |

Submissions outside the live window (before start / after end / `ENDED`) are rejected; unsupported languages are rejected.

---

## Library — `/api/v1/library`

Study sheets, personal progress, private notes, practice modes, and browse collections.

### Study sheets
| Method | Path | Gate |
|---|---|---|
| GET | `/sheets` · `/sheets/:slug` | `attachUser` (personalised) |
| POST | `/sheets` | `sheet:manage-own` |
| PUT/DELETE | `/sheets/:id` | `sheet:manage-own` (owner enforced per record) |
| POST | `/sheets/:id/items` · DELETE `/sheets/:id/items/:questionId` | `sheet:manage-own` |
| PUT | `/sheets/:id/reorder` | `sheet:manage-own` |

### Progress (always personal)
| Method | Path | Gate |
|---|---|---|
| GET | `/progress` · `/progress/stats` · `/progress/activity` | `progress:read` |
| PATCH | `/progress/:questionId` | `practice:use` |
| POST | `/progress/:questionId/bookmark` | `practice:use` |

`/progress/activity` returns the streak + heatmap (see [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md)).

### Private notes
| Method | Path | Gate |
|---|---|---|
| GET/PUT | `/notes/:questionId` | `notes:manage` (owner-scoped) |

### Practice modes
| Method | Path | Gate |
|---|---|---|
| GET | `/practice/random` · `/daily` · `/topic/:slug` · `/company/:slug` · `/mixed` | `attachUser` |
| POST | `/practice/mock` | `attachUser` |
| GET | `/practice/revision-queue` | `revision:use` |
| GET | `/practice/weak-topics` | `progress:read` |

### Collections
| Method | Path | Gate |
|---|---|---|
| GET | `/collections/companies` · `/topics` · `/sources` | `attachUser` |

---

## Revision — `/api/v1/revision`

SM-2 spaced repetition; all endpoints require `revision:use` and are scoped to the caller.

| Method | Path | Notes |
|---|---|---|
| GET | `/queue` | Cards due for review. |
| POST | `/review` | Grade a card; reschedules via SM-2. |
| POST | `/enqueue` | Add a question to the schedule. |
| DELETE | `/:questionId` | Remove from the schedule. |

---

## Real-time — Socket.IO

Judge verdicts are pushed over Socket.IO (same origin; nginx proxies `/socket.io/`). A client
joins the room `user:<userId>` and receives `submission:update` events keyed by `submissionId` as
the submission moves `PENDING → RUNNING → <terminal verdict>`. If the socket is unavailable the
client falls back to polling `GET /questions/submission/:submissionId`. See
[SYSTEM_DESIGN.md](SYSTEM_DESIGN.md#the-judge).

## External APIs consumed

- **Google Identity** — ID-token verification (`POST /auth/google`) and the authorization-code
  flow (`/auth/google/start` · `/callback`). Requires `GOOGLE_CLIENT_ID`/`SECRET`/`REDIRECT_URI`.
- **GitHub OAuth** — authorization-code flow only (`/auth/github/start` · `/callback`); code
  exchange and profile/email read happen server-side. Requires `GITHUB_CLIENT_ID`/`SECRET`/`REDIRECT_URI`.
- **Email provider** — verification/reset mail via `MAIL_PROVIDER` (`smtp`/`resend`/`sendgrid`;
  `console` in development). Production refuses the console mailer.

> OAuth and email are **optional to configure**. With Google/GitHub unset, `GET /auth/config`
> reports them disabled and the UI renders the buttons as "not configured" rather than failing.
