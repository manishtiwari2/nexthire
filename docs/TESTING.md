# Testing

> Verified by running the suite (`cd server && npm test`) and reading the files under
> [`server/test/`](../server/test/). Counts and behaviours below are measured, not estimated.

## Overview

The backend has a substantial automated test suite: **219 tests, all passing**
(`ℹ tests 219 / pass 219 / fail 0`). Tests mix pure unit tests, real HTTP+database integration
tests, and dependency-injected tests of the judge pipeline, plus two runnable end-to-end/verification
scripts.

The frontend has no automated test suite today; it relies on TypeScript (`tsc --noEmit`) and lint
for static checking. See [Gaps](#gaps--limitations).

## Stack

- **Runner:** Node's built-in `node:test` with `node:assert`. `npm test` = `node --test`.
- **No test framework dependency** (no Jest/Mocha/Vitest on the server).
- **Static checks:** `npm run typecheck` (client, `tsc --noEmit`); `.oxlintrc.json` (oxlint, React rules).

## Running the tests

```bash
cd server && npm test
```

- **Requires a reachable PostgreSQL** (`DATABASE_URL`): several suites are true integration tests
  against a real database. They set `DISABLE_RATE_LIMIT=1`, use the console mailer, and clean up
  their own rows.
- **Does not require Redis or Docker:** the judge is exercised through injected fakes, and external
  OAuth is stubbed.

## Test types

1. **Pure unit** — import real modules and assert, no I/O. Example: `verdict.test.js`,
   `languageConfig.test.js`, `auth.test.js`, `hiddenTestcases.test.js`.
2. **Integration (real code + real DB, real HTTP)** — `authFlow.test.js` and `githubAuth.test.js`
   boot the **real Express router over HTTP on an ephemeral port** against the **real Prisma client
   + local Postgres** (external OAuth stubbed). `authorization`, `contestSubmission`, `library`,
   `contestExposure` call real controllers/modules against real Prisma.
3. **Dependency-injected judge tests** — `processor.test.js` and `queue.test.js` pass fake
   prisma / fake executor / fake BullMQ, so the judge logic is tested with **no Docker, Redis, or
   DB**.
4. **Legacy assert scripts** — `contestEngine`, `practiceIde`, `questionBank` are standalone
   `require('assert')` scripts that re-implement the logic locally. Under `node --test` each counts
   as one file-level test. Flagged as testing debt (see [Gaps](#gaps--limitations)).

## Organization

All files live in [`server/test/`](../server/test/). Individual-case counts sum to 219.

| File | Cases | What it covers |
|---|---:|---|
| `authFlow.test.js` | 71 | End-to-end auth over real HTTP+Prisma: register/verify, login gating, refresh cookie HttpOnly/CSRF/rotation/**reuse detection**, remember-me TTL, lockout, disabled-account ejection, `tokenVersion` bump, logout/logout-all, session list/revoke, forgot/reset/change password, admin capabilities, Google ID-token verification, profile, security timeline. |
| `auth.test.js` | 46 | Auth primitives (no I/O): `ADMIN_EMAILS`→role, permission matrix (ADMIN ⊇ USER; CANDIDATE≡USER), bcrypt policy (cost, unique salt, 72-byte limit), JWT round-trip/tamper/expiry, refresh-token entropy+hashing, user-DTO allow-listing, registration/login validation & XSS rejection, UA parsing, rate limiter. |
| `githubAuth.test.js` | 31 | End-to-end GitHub OAuth (router/Prisma/HTTP; GitHub API stubbed): config hides secret, state-cookie handshake, off-site-redirect refusal, account create/link, verified-email selection, admin allow-list applied (not trusted from GitHub), unverified-email refusal, unlink rules. |
| `runVsSubmit.test.js` | 8 | Trial vs submit: trial judged on samples only / submit on all; trial records no progress/points; submit records progress + awards contest points; trial flag read from the row not the payload; run still reaches a terminal status. |
| `verdict.test.js` | 8 | Pure verdict logic: output normalisation (whitespace/CRLF); verdict priority ACCEPTED/WA/RE/TLE/MLE/OLE. |
| `library.test.js` | 8 | Integration vs seeded Postgres: private-notes isolation, progress status/bookmark + filter, system sheets/Blind75 items, owner-scoped custom-sheet CRUD, practice daily/mixed, browse filters. |
| `contestExposure.test.js` | 7 | Regression guards: contest controller never uses a bare `user:true` include, safe public projection everywhere, listings carry no statements, invite codes use CSPRNG, join-by-code enforces limits. |
| `languageConfig.test.js` | 7 | Language config: Python/C++/Java supported, others null; interpreted-vs-compiled shapes; argv arrays (no shell string); env image override. |
| `processor.test.js` | 6 | `judgeProcessor.processJob` with fake prisma+executor: persistence + RUNNING→final, event emission, contest points on first AC, no double-award, INTERNAL_ERROR on executor throw, no-op when submission missing. |
| `submissionExposure.test.js` | 6 | Audited defects: history DTO hides hidden-case answers even from the owner; practice `execute` ignores client `context`/`contestId` (pins PRACTICE); only the contest endpoint creates CONTEST submissions. |
| `authorization.test.js` | 5 | Submission read/cancel authz: owner reads, other user denied (IDOR), admin reads any, non-owner cannot cancel, cannot cancel non-PENDING. |
| `contestSubmission.test.js` | 5 | Contest submission window/status gating (live accepts; after-end/ENDED/before-start reject; unsupported language rejected). |
| `hiddenTestcases.test.js` | 4 | Submission DTO strips hidden-case I/O for non-admins (keeps aggregate pass/total); admin DTO includes it. |
| `queue.test.js` | 4 | `JudgeQueue` with a fake BullMQ: `submissionId` used as `jobId`, rejects missing id, `cancelJob` removes a waiting job, event payload stays light + hidden-safe. |
| `contestEngine.test.js` | 1* | (legacy) Leaderboard sort score DESC / penalty ASC. |
| `practiceIde.test.js` | 1* | (legacy) SM-2 next-review interval calc. |
| `questionBank.test.js` | 1* | (legacy) Question payload structure validation. |

\* File-level count under `node --test` (these files call no `test()`); they contain internal assert blocks.

## End-to-end & verification scripts

- **`npm run test:e2e`** (`server/scripts/e2eSmoke.mjs`) — drives the **real running server** over
  HTTP end-to-end: registration/verification, login/refresh/logout, question authoring, Run vs
  Submit and **all five verdicts from real execution**, hidden-test-case leakage checks on every
  read path, submission history & progress, multi-user IDOR probes, contest lifecycle/scoring/expiry,
  abuse handling, admin capability. Needs the server running with the console mailer, `SERVER_LOG`
  pointing at its stdout (it scrapes verification/reset links), and `DISABLE_RATE_LIMIT=1`. Takes
  ~2 min because it waits out a real ~90-second contest window to prove post-expiry submissions are
  refused.
- **`npm run verify:problems`** (`server/scripts/verifySolvable.js`) — runs each solvable problem's
  known-correct reference Python solution against every one of its own test cases and fails on any
  mismatch; also asserts each problem has ≥1 sample and ≥1 hidden case. It is **also invoked by
  `npm run seed`**, which refuses to write a problem set that fails verification.

## Coverage

No coverage tool is configured; there is no coverage percentage to report. Qualitatively, the
security- and correctness-critical server paths are well covered: auth flows, authorization/IDOR,
hidden-test-case exposure, the verdict function, run-vs-submit semantics, contest gating/scoring,
and the judge processor/queue. The integration tests exercise real database behaviour rather than
mocks.

## Gaps & limitations

- **No frontend tests.** The client is checked only by `tsc --noEmit` and lint.
- **The Docker sandbox itself is not exercised by `npm test`** — the judge is tested via fakes
  (fast, no Docker), and the *real* sandbox path is validated only by the manual `test:e2e` script.
- **Three legacy files re-implement logic locally** instead of importing it, so they can pass while
  the real implementation drifts. Migrating them to import the production code is outstanding
  testing debt (see [ROADMAP.md](ROADMAP.md)).
- **Integration tests need a real Postgres**, so `npm test` is not fully hermetic.
