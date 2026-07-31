# NextHire — API Specification

> Base URL: `http://localhost:5000/api/v1` (unversioned aliases `/api/*` also mounted).
> All responses are JSON with the envelope `{ success: boolean, data?, error?, pagination? }`.
> Auth is `Authorization: Bearer <JWT>`. Last reviewed 2026-07-31.
>
> ⚠️ Items marked **DEFECT** describe current, verified behavior that diverges from a secure/
> correct design. Endpoints marked **(MISSING)** are referenced by the client or README but do
> not exist (return 404).

## Conventions

- Success: `2xx` with `{ success: true, data }`.
- Client error: `400/401/403/404` with `{ success: false, error }`.
- Server error: `500 { success: false, error: <internal message> }` — **DEFECT**: leaks raw
  error messages (e.g. Prisma internals).
- No request-body schema validation (zod is a dependency but unused).

---

## Auth — `/auth`

### POST `/auth/google`
- **Auth**: none.
- **Body**: `{ credential?, email?, name?, avatarUrl?, googleId? }`. If `credential` is present
  it is **decoded (not verified)** to fill fields.
- **Behavior**: finds/creates the user (creates Profile on first login); assigns role via
  hardcoded email allowlist; returns a 7-day JWT.
- **Response 200**: `{ success, data: { accessToken, user: {id,email,name,role,avatarUrl} } }`
- **Errors**: `400` if no email; `500` on failure.
- **DEFECT**: Google `credential` signature is never verified → forged tokens are trusted.

### POST `/auth/login`  and  POST `/auth/register`
- **Auth**: none. `register` is an alias of `login` (same handler).
- **Body**: `{ email, password?, name?, role? }`. `password` and `role` are **ignored**.
- **Behavior**: **auto-creates** the account if the email is unknown — **no password check**.
- **Response 200**: `{ success, data: { accessToken, user } }`
- **Errors**: `400` if no email.
- **DEFECT**: passwordless login for any email; role cannot be self-assigned (good) but is set
  purely from the email allowlist.
- **Example**:
  ```bash
  curl -X POST /api/v1/auth/login -H 'Content-Type: application/json' \
       -d '{"email":"anuradha@admin.at"}'   # returns an ADMIN token, no password
  ```

### GET `/auth/me`
- **Auth**: required (`requireAuthenticated`).
- **Response 200**: `{ success, data: <User with profile.userSkills> }`
- **Errors**: `401` no token, `403` invalid/expired, `404` user not found.

---

## Questions — `/questions`

### GET `/questions`
- **Auth**: **none** (public).
- **Query**: `page` (≥1), `limit` (1–100, default 10), `search`, `difficulty`, `topicId`, `tagId`.
- **Behavior**: case-insensitive title/description search; includes topic, starter codes,
  **sample** test cases only, hints, tags, company tags. Ordered `createdAt desc`.
- **Response 200**: `{ success, data: Question[], pagination: {total,page,limit,totalPages} }`
- **DEFECT**: `hints` are included in the list payload (may be undesirable pre-solve).

### GET `/questions/:id`
- **Auth**: **none** (public). — **DEFECT: should require auth.**
- **Behavior**: returns the question including **all** test cases (sample **and hidden**), the
  **editorial content + full solution**, hints, tags.
- **Response 200**: `{ success, data: Question }`; `404` if not found.
- **DEFECT (verified)**: anonymous callers can read hidden test cases and answer keys.

### GET `/questions/topics`
- **Auth**: none. Returns topics with `_count.questions`.

### GET `/questions/:id/submissions`
- **Auth**: required. Returns up to 20 of the **caller's** submissions for the question, each
  with its latest execution. Ordered `createdAt desc`.

### POST `/questions`  `[ADMIN]`
- **Auth**: `requireAuthenticated` + `requireAdmin`.
- **Body**: `{ title, difficulty?, topicName?, description?, constraints?, timeLimitMs?,
  memoryLimitMb?, starterCodes?[], testCases?[], hints?[], editorialContent?, editorialSolution? }`.
- **Behavior**: slugifies title (+4-digit time suffix), finds/creates topic, creates question
  with nested children; falls back to placeholder starter/test data if arrays omitted.
- **Response 201**: `{ success, data: Question }`.
- **DEFECT**: no validation; missing `title` yields slug `question-...` and may violate NOT NULL
  on `title` → `500` with raw Prisma error.

### PUT `/questions/:id`  `[ADMIN]`
- **Auth**: admin. **Body**: `{ title?, difficulty?, description?, constraints? }`.
- **DEFECT**: cannot update test cases, starter code, hints, editorial, or topic — so admins
  cannot fully maintain a question after creation.

### DELETE `/questions/:id`  `[ADMIN]`
- **Auth**: admin. Cascades children. `500` (raw) if id missing.

### POST `/questions/:id/execute`
- **Auth**: required.
- **Body**: `{ code, language?, context?, contestId?, interviewId? }`.
- **Behavior**: creates a `PENDING` submission, enqueues a judge job, returns immediately.
- **Response 200**: `{ success, data: { submissionId, jobId, status: 'QUEUED' } }`.
- **DEFECT**: caller must poll `/questions/submission/:submissionId`; the judge verdict is
  simulated (near-always `ACCEPTED`).

### GET `/questions/submission/:submissionId`
- **Auth**: required. Returns the submission with `executions` + `question`.
- **DEFECT (authorization)**: does **not** verify the submission belongs to the caller — any
  authenticated user can read any submission's code by id (IDOR).

---

## Contests — `/contests`

### GET `/contests`
- **Auth**: **none**. Recomputes statuses, returns all contests with host, questions,
  participant count. **DEFECT**: unpaginated; public.

### GET `/contests/:id`
- **Auth**: **none**. — **DEFECT: should require auth.**
- Returns host, ordered questions (with full question incl. constraints), participants (with
  full `user`), and **all invites (codes)**.
- **DEFECT (verified)**: leaks invite codes and participant emails to anonymous users.

### GET `/contests/:id/leaderboard`
- **Auth**: none. Non-disqualified participants ordered by score desc, penalty asc; rank
  assigned by index. **DEFECT**: scores never change (no write path).

### POST `/contests`  `[ADMIN]`
- **Auth**: admin. **Body**: `{ title*, description*, bannerUrl?, startTime?, endTime?,
  questionIds?[] }`. Creates contest + one invite; status LIVE if start ≤ now.
- **Response 201**: `{ success, data: { ...contest, joinCode } }`. `400` if title/description missing.

### POST `/contests/join-by-code`
- **Auth**: required. **Body**: `{ code }`. Upserts a participant by resolving the invite's
  contest. **DEFECT**: ignores `maxUses`/`expiresAt`; does not increment `usedCount`.

### POST `/contests/:id/join`
- **Auth**: required. **Body**: `{ inviteCode? }`. Rejects ended contests; if `inviteCode`
  given, validates + increments `usedCount` (respects `maxUses`, **not** `expiresAt`). Upserts
  participant.

### POST `/contests/:id/heartbeat`
- **Auth**: required. Updates `lastHeartbeatAt`. `500` (raw) if caller is not a participant
  (update on missing composite key). **DEFECT**: should be 404/403, not 500.

### POST `/contests/:id/submit`
- **Auth**: required. **Body**: `{ questionId, code, language? }`. Requires an active,
  non-disqualified participant; creates a CONTEST submission, enqueues judge, bumps heartbeat.
- **DEFECT**: does not verify `questionId` belongs to the contest; no scoring on accept.

### POST `/contests/:id/invites`  `[HOST]`
- **Auth**: `requireAuthenticated` + `requireContestHost`. **Body**: `{ maxUses?, expiresAt? }`.
  Creates a new `DSA-XXXXXX` invite.

---

## Health & Docs

- **GET `/api/health`** — `{ status:'ok', service, timestamp }`. No auth.
- **GET `/docs`** — static OpenAPI stub (dev only). No auth. **Note**: the stub advertises
  `/interviews` and `/dashboard/stats` which are not implemented.

---

## Missing endpoints referenced by client/README (all 404)

| Endpoint | Referenced by |
|----------|---------------|
| `POST /revision/review` | `RevisionScheduleCard.tsx` (SM-2 rating) |
| `GET /interviews`, `/interviews/:id`, `POST /interviews`, `POST /interviews/:id/report` | README |
| `GET/PUT /users/profile` | README; header links to `/profile` |
| `GET /notifications`, `POST /notifications/broadcast` | README; header bell → `/notifications` |
| `GET /dashboard/stats` | swagger stub |

## Cross-cutting recommendations

1. Require authentication on all question/contest **detail** reads; strip hidden test cases and
   editorial for non-owners/non-admins.
2. Enforce ownership on `GET /questions/submission/:id` (IDOR).
3. Add zod validation at the route boundary; stop returning raw error messages.
4. Enforce invite `expiresAt`/`maxUses` consistently across both join paths.
5. Implement scoring on accepted contest submissions.
