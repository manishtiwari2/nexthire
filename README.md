# NextHire

A DSA interview-preparation platform. You browse problems, solve them in a real code editor,
and get a real verdict from code that actually ran against hidden test cases — plus contests,
progress tracking and spaced-repetition revision on top.

It is a personal-scale product: one Postgres, one API, one judge worker, one static frontend.

---

## What it does

1. Sign up with an email and password (or Google / GitHub), verify the address, sign in.
2. Browse and search the question library, filtered by difficulty, topic, company or whether
   the problem is solvable here.
3. Open a problem, read the statement, write a solution in Monaco with your language's starter
   template.
4. **Run** executes the sample cases only — a scratchpad. Nothing is recorded.
5. **Submit** executes every case, including hidden ones, and records the attempt.
6. The verdict comes from a real process: ACCEPTED, WRONG ANSWER, TIME LIMIT EXCEEDED,
   MEMORY LIMIT EXCEEDED, OUTPUT LIMIT EXCEEDED, COMPILATION ERROR or RUNTIME ERROR.
7. Submission history, per-question progress, streaks and a revision schedule build up as you go.
8. An admin can author questions and host timed contests with a leaderboard.

Languages the judge runs: **Python, C++, Java**.

---

## Architecture

```
Browser ──► nginx (serves the SPA, proxies /api and /socket.io)
                │
                ▼
          Express API ──────► PostgreSQL          (users, questions, submissions, progress)
                │
                ├──────────► Redis / BullMQ       (submission queue)
                │                  │
                │                  ▼
                │           Judge worker ──► one throwaway Docker container per test case
                │                  │
                └──◄── verdict ────┘  (Redis pub/sub → Socket.IO → the submitter's browser)
```

The API **never executes user code**. It writes a submission row and enqueues a job. Only the
judge worker executes anything, and it does so inside a container that is `--network none`,
`--read-only`, `--cap-drop ALL`, non-root, memory-capped, pid-capped and wall-clock-killed.

Socket.IO carries exactly one thing: "your submission's verdict is ready." If it cannot
connect, the client falls back to polling and everything still works, just less immediately.

### Code layout

```
client/src/
  api/            HTTP client (token refresh, CSRF), judge socket
  features/       auth, question-bank, library, contest, revision — each owns its API + components
  pages/          one file per route
  shared/         design-system primitives, hooks, helpers
server/src/
  features/
    auth/         registration, sessions, OAuth, email, admin user management
    question-bank/browse, author, submit
    submission/   read paths + the DTO that strips hidden test cases
    contest/      contests, invites, participation, leaderboard
    library/      study sheets, progress, notes, practice modes
    revision/     SM-2 spaced repetition
    judge/        queue, worker, processor, executors, verdict logic
  shared/         prisma client, permission matrix, rate limiting
```

---

## Running it

### Everything in Docker (closest to production)

```bash
docker pull python:3.10-slim && docker pull gcc:13 && docker pull eclipse-temurin:17-jdk
cp .env.example .env      # then fill in JWT_SECRET, ADMIN_EMAILS, MAIL_PROVIDER
docker compose up -d --build
```

App on <http://localhost:8080>. Then seed the question library:

```bash
docker compose exec api npm run seed
```

### Locally, without Docker

You need PostgreSQL and Redis running, plus `python3`, `g++` and a JDK on PATH.

```bash
cd server && npm install
cp ../.env.example .env               # edit DATABASE_URL, JWT_SECRET, ADMIN_EMAILS
npm run prisma:generate
npm run prisma:migrate                # or: npm run prisma:push for a throwaway database
npm run seed
npm start                             # terminal 1 — API on :5000
npm run worker                        # terminal 2 — judge worker

cd ../client && npm install && npm run dev   # terminal 3 — app on :3000
```

Set `MAIL_PROVIDER=console` in development: verification and password-reset links are printed
to the server's stdout instead of being emailed.

### No Docker at all

The judge can run submissions directly on the host with no sandbox:

```bash
JUDGE_INLINE=1 JUDGE_UNSAFE_LOCAL=1 npm start
```

This runs untrusted code as your user with only a timeout. It is a development convenience for
machines without Docker, nothing more. The server **refuses to boot in production** with either
flag set — see `assertProductionConfig()` in `server/src/features/auth/authConfig.js`.

---

## Infrastructure: what is actually required

| Component | Status | Why |
|---|---|---|
| **PostgreSQL** | Required | Everything persistent. |
| **Docker (judge host)** | Required in production | The only thing between untrusted code and your machine. |
| **Redis + judge worker** | Required in production | Keeps code execution out of the API process, survives restarts, scales with `--scale judge-worker=N`. Replaceable by `JUDGE_INLINE=1` for a single-user deploy — see the note below. |
| **Socket.IO** | Optional | Live verdict push. The client polls if it is absent. |
| **Email (SMTP / Resend / SendGrid)** | Required | Verification and password reset. Set `EMAIL_VERIFICATION_REQUIRED=false` to run without it, at the cost of unverified signups. |
| **Google / GitHub OAuth** | Optional | Both sign-in buttons render as "not configured" when their credentials are absent. |
| **Object storage** | Not used | No uploads anywhere in the product. |

**On Redis:** it is one Docker service and one env var, and it buys a real property — the web
process never executes user code, so a fork bomb or an OOM in a submission cannot take the API
down with it. For a single-user deployment `JUDGE_INLINE=1` removes Redis and the worker
entirely and judges in-process; that is a legitimate trade, but it puts execution back inside
the API. Keep the queue if more than one person will use this.

---

## Decisions worth explaining

**The access token lives in a JavaScript variable, not `localStorage`.** Anything in
`localStorage` is readable by any script on the page, so one XSS bug leaks a credential an
attacker can walk away with. The token dies with the tab; the refresh token sits in an
HTTP-only cookie the page cannot read, and the app calls `/auth/refresh` once on boot to
restore the session.

**Refresh tokens rotate and detect reuse.** Each session stores the SHA-256 of its current
refresh token and of the one it replaced. Presenting the old one means the token was stolen and
replayed, so every session for that user is revoked.

**Every authenticated request re-checks the database.** A valid signature is not enough: the
account must still exist, still be enabled, still match its `tokenVersion`, and its session must
not be revoked. That is one indexed lookup per request, and it is what makes "log out
everywhere" and "disable this account" take effect immediately instead of after the token expires.

**ADMIN comes from `ADMIN_EMAILS`, not from the database.** The role is re-derived on every
sign-in, so promoting or demoting someone is a config change. There is deliberately no
role-editing endpoint — anything it wrote would be undone at the next login.

**Routes declare permissions, not roles.** `requirePermission('question:manage')` rather than
`requireAdmin`. The matrix in `server/src/shared/authz.js` is the only place that maps roles to
capabilities, and `/auth/me` hands the client the same list so the UI never recomputes it.

**Run and Submit are different operations.** Run executes sample cases only, in a row flagged
`isTrialRun`, and never touches history, progress, streaks or a leaderboard. If both buttons hit
the hidden tests, the count of hidden failures alone tells a solver things they should not know.

**Hidden test cases never leave the server.** Every submission read path goes through
`submissionDto.js`, which drops non-sample test results entirely. Non-admins get the aggregate
pass/total and nothing else.

**Verdict logic is a pure function.** `judge/executor/verdict.js` takes the raw signals from a
container run — timed out, OOM-killed, output truncated, exit code, stdout — and returns a
verdict. No I/O, so it is exhaustively unit-tested, and resource-limit signals are checked
before correctness because a killed program has no trustworthy output.

**The question library is mostly links, and says so.** 148 entries are metadata plus a source
URL: title, topic, difficulty and company tags, with no statement or test cases copied from
anywhere. They give the library and the study sheets breadth. The 12 problems in
`prisma/data/solvable.js` are written for NextHire and are what the judge actually runs. The
browse filter defaults to those.

**The seed refuses to write a problem it cannot verify.** Every solvable problem ships a
reference solution; `npm run seed` runs it against all of that problem's test cases first and
aborts on any mismatch. A wrong expected output is the worst bug a judge can have — the user
writes a correct solution, gets WRONG ANSWER, and has no way to tell that from their own bug.
This check caught two of mine.

---

## Testing

```bash
cd server && npm test              # 219 unit tests, no services needed
cd server && npm run verify:problems   # every problem's reference solution vs its own tests
cd client && npm run typecheck && npm run build
```

There is also an end-to-end smoke test that drives the real HTTP API — registration through
email verification, all five verdicts from real execution, contest scoring and expiry, IDOR
probes, malformed input. It needs a running server; see the header of
`server/scripts/e2eSmoke.mjs`.

---

## Configuration

`.env.example` is the full list. The ones without a safe default:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. |
| `JWT_SECRET` | 48 random bytes: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `ADMIN_EMAILS` | Comma-separated. These addresses get ADMIN on sign-in; everyone else is USER. |
| `MAIL_PROVIDER` | `console` in development. Production refuses to boot with it. |
| `CLIENT_URL` | The origin users actually visit. Used for email links and CORS. |
| `REDIS_URL` | Only when running the queue (the default). |

In production the server validates its own configuration at boot and crashes rather than start
with a dev secret, insecure cookies, a mail provider that silently drops verification emails, or
either judge escape hatch enabled.

---

## Known limitations

- **12 solvable problems.** Enough to exercise every feature end to end; not enough for months
  of preparation. Adding more means adding entries to `prisma/data/solvable.js`.
- **In-memory rate limiting.** Each API replica enforces its own window. Correct for a single
  instance; put a gateway limiter in front if you scale out.
- **The judge worker needs the host Docker socket**, which is root-equivalent on that host. Run
  it somewhere dedicated to judging.
- **Monaco is a 3.7 MB chunk** (960 KB gzipped). It is split out and lazily loaded, so it does
  not block the problem statement, and it is cached across deploys.
- **Contests are admin-created.** A normal user joins with a code but cannot host one.
