# Roadmap

> Evidence-based status only. "Completed" items are backed by code, schema, tests, or config in the
> repository. "Planned" means there is concrete evidence of intent (a placeholder, a reserved enum
> value, a documented caveat). "Potential future" items are proposals with no current implementation.

## Completed

Backed by the current source, schema, and passing tests.

| Area | Evidence |
|---|---|
| **Real password auth + email verification** | `server/src/features/auth/`, `authFlow.test.js` (71 cases) |
| **In-memory access token + rotating refresh cookie with reuse detection** | `Session.tokenHash`/`previousTokenHash`, auth-flow tests; [ADR-0002](decisions/0002-in-memory-access-token-rotating-refresh.md) |
| **Google + GitHub OAuth** | `authController` Google/GitHub handlers, `githubAuth.test.js` (31 cases) |
| **Permission matrix + `ADMIN_EMAILS`-derived admin** | `shared/authz.js`, `auth.test.js`; [ADR-0003](decisions/0003-permission-matrix-and-admin-emails.md) |
| **Sandboxed multi-language judge (Python/C++/Java)** | `features/judge/executor/`, `verdict.test.js`, `languageConfig.test.js`; [ADR-0001](decisions/0001-sandboxed-judge-bullmq-worker.md) |
| **BullMQ queue + separate worker + Redis→Socket.IO relay** | `judgeQueue.js`, `judgeWorker.js`, `judgeEvents.js`, `processor.test.js`, `queue.test.js` |
| **Run vs Submit semantics** | `Submission.isTrialRun`, `runVsSubmit.test.js` (8 cases) |
| **Hidden-test-case protection + IDOR fixes** | DTO stripping, `hiddenTestcases.test.js`, `submissionExposure.test.js`, `authorization.test.js` |
| **Question library (solvable + reference-only) with filters/collections** | `features/question-bank/`, `features/library/`, `library.test.js` |
| **Progress tracking, private notes, streak/heatmap, dashboard** | `progressController`, `notesController`, `/progress/activity` |
| **SM-2 spaced-repetition revision** | `features/revision/`, `RevisionSchedule` model |
| **Study sheets (system + custom)** | `features/library/sheetController`, `sheets.js` seed (5 sheets) |
| **Contests: lifecycle, invite codes, scoring, leaderboard, 3-phase UX** | `features/contest/`, `contestSubmission.test.js`, `contestExposure.test.js` |
| **Admin: user management + analytics + rejudge** | `adminUserController`, submission `rejudge` |
| **Committed Prisma migration baseline (`0_init`)** | `server/prisma/migrations/0_init/` (27 tables, 14 enums) |
| **Full-stack Docker Compose + Dockerfiles + nginx** | `docker-compose.yml`, `server/Dockerfile`, `client/Dockerfile`, `client/nginx.conf` |
| **Seed data + solvability verification** | `scripts/seedLibrary.js`, `scripts/verifySolvable.js` (12 solvable / 148 reference / 5 sheets) |
| **219 automated backend tests** | `server/test/` (see [TESTING.md](TESTING.md)) |
| **Boot-time production config guard** | `assertProductionConfig()` in `authConfig` |

## In progress / partial

- **Problem discussion** — a Discussion tab exists on the solve page as a **placeholder**; no
  threaded discussion backend yet.
- **Migrations in deploy** — migrations are committed and documented, but the API container does not
  run them automatically (`npm start`); they are applied out-of-band. See
  [SYSTEM_DESIGN.md](SYSTEM_DESIGN.md#migrations-caveat).

## Planned (evidence of intent)

- **More judged languages** — the `Language` enum reserves `JAVASCRIPT`, `TYPESCRIPT`, `GO`; the
  judge's `languageConfig` currently implements only Python/C++/Java. Adding a language is a config
  + sandbox-image change.
- **Threaded discussion** — completing the placeholder tab into a real feature.
- **Java sandbox image hardening** — purpose-built `server/docker/Dockerfile.java` (uid-1000) exists
  for the `--user 1000:1000` HOME issue; making it the default for Java is a documented follow-up.

## Potential future (proposed, no implementation)

- **Shared rate limiting** across API replicas (today the limiter is in-memory per process).
- **Remote/rootless Docker endpoint** for the worker to avoid the host-socket mount in more
  environments (the code already allows `JUDGE_DOCKER_BIN` + `DOCKER_HOST`).
- **Coverage tooling** and **frontend tests** (client is currently type-checked/linted only).
- **Migrating the three legacy test files** to import production logic instead of re-implementing it.
- **Richer analytics / editorial media.**

## Notes on history

Recent development consolidated a large rewrite: earlier snapshots of the codebase (reflected in the
now-removed `docs/*` reports) described a simulated judge, passwordless auth, and no contest scoring.
The current codebase has replaced all of these with the implemented items above. This README and the
source are the source of truth; the older reports were dated review snapshots.
