# Judge System — Verification Report

Date: 2026-07-31

## Summary
The fake/simulated judge has been replaced with a real, sandboxed, queue-driven online judge.
Verdicts are produced exclusively by actual execution inside Docker containers.

## Verified in the development environment ✅
Run from `server/` unless noted.

| Check | Command | Result |
|---|---|---|
| Server unit tests | `npm test` (`node --test`) | **38/38 pass** |
| Lint | `npx oxlint` (repo root) | **0 errors** (warnings only, pre-existing) |
| Client typecheck | `client$ npx tsc --noEmit` | **pass (exit 0)** |
| Client build | `client$ npx vite build` | **pass — built in ~2s** |
| Module load smoke test | `node -e "require(...judge/submission modules)"` | **all load cleanly** |

Unit tests are self-contained (no Docker/Redis/DB) via dependency injection + mocks, covering:
verdict logic for **all** verdicts (Accepted/WA/RE/CE/TLE/MLE/OLE), output comparison, language
config, queue payload shaping, the worker's `processJob` (persistence, status transitions, event
emission, contest scoring, executor-crash → INTERNAL_ERROR), hidden-test-case DTO stripping, and
submission-read/cancel authorization (IDOR).

## Requires a Docker host — NOT run in this environment ⚠️
Docker, Redis and Postgres are not available in the dev sandbox this was built in (`docker` not
installed, no Redis). The following must be run on a machine with Docker to complete end-to-end
verification. Each step and its expected result:

1. **Infra up**
   ```bash
   docker compose up -d postgres redis
   cd server && npm install && npm run prisma:generate && npm run prisma:push
   docker pull python:3.10-slim gcc:13 eclipse-temurin:17-jdk
   npm run dev      # terminal 1 (API)
   npm run worker   # terminal 2 (judge worker)
   ```
2. **Correct solution** → `ACCEPTED`, `passedTests == totalTests`, real time/memory.
3. **Wrong solution** (prints wrong output) → `WRONG_ANSWER`, partial pass count.
4. **Syntax error** → `COMPILATION_ERROR` with real compiler output; no test cases run.
5. **Runtime crash** (`throw` / segfault / uncaught exception) → `RUNTIME_ERROR` with stderr.
6. **Infinite loop** (`while True: pass`) → `TIME_LIMIT_EXCEEDED` (container killed at the limit).
7. **Memory bomb** (allocate > limit) → `MEMORY_LIMIT_EXCEEDED` (OOM kill, exit 137).
8. **Fork bomb** → contained by `--pids-limit`; run ends as RE/TLE, host unaffected.
9. **Output flood** (print in an infinite loop) → `OUTPUT_LIMIT_EXCEEDED` (1 MiB cap).
10. **Hidden cases** — as a non-admin, fetch `GET /submissions/:id/result`: only sample cases
    appear; hidden input/expected/stdout are absent. As admin: full detail present.
11. **Concurrency** — submit N solutions at once; all get correct independent verdicts
    (`JUDGE_CONCURRENCY` / multiple worker replicas).
12. **Restart recovery** — submit, kill the worker mid-run, restart it: the job resumes from
    Redis; a submission left PENDING is re-enqueued by `reconcilePendingSubmissions()` on API boot.
13. **Realtime** — the IDE shows queued → running → verdict live via `submission:update` with no
    polling while the socket is connected (Network tab shows no repeated result GETs).

## Notes / limitations
- **Memory measurement** under Docker is reported only when the OOM killer fires (→ MLE); precise
  per-run peak RSS is not captured with stock base images. The `memoryUsed` field is `null` when
  not measured (the UI shows "—" rather than a fabricated number). Prebaking `/usr/bin/time` into
  the `server/docker/*` images is a straightforward future enhancement.
- Windows hosts: bind-mount path translation is handled by Docker Desktop; production targets are
  Linux workers.
