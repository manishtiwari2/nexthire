# NextHire Judge System

Production-grade online judge that safely compiles and executes untrusted candidate code
against test cases and returns real verdicts. **Every verdict comes from actual sandboxed
execution — there are no simulated or hardcoded results.**

## Architecture

```
Client (Practice IDE)
   │  POST /questions/:id/execute   (or /contests/:id/submit)
   ▼
Express API  ──────────────►  Submission row created (status PENDING)
   │  judgeQueueInstance.enqueueJob()
   ▼
BullMQ  ──►  Redis  ──►  Judge Worker (separate process, `npm run worker`)
                              │  executor.executeSubmission()
                              ▼
                        Docker Sandbox  (one container per compile + per test case)
                              │
                              ├──►  ExecutionResult persisted (Prisma / Postgres)
                              ├──►  Submission.status updated
                              └──►  Redis pub/sub  ──►  API relay  ──►  Socket.IO
                                                                          │
                                                        Client updates live (submission:update)
```

The **Express API never executes user code** — it only enqueues jobs. Code runs exclusively
inside the judge worker, and only inside Docker containers.

### Key modules
| Concern | File |
|---|---|
| Queue producer (BullMQ) | `server/src/features/judge/judgeQueue.js` |
| Worker process | `server/src/features/judge/judgeWorker.js` |
| Job logic (testable core) | `server/src/features/judge/judgeProcessor.js` |
| Docker executor | `server/src/features/judge/executor/dockerExecutor.js` |
| Native dev fallback (unsafe) | `server/src/features/judge/executor/nativeExecutor.js` |
| Verdict logic (pure) | `server/src/features/judge/executor/verdict.js` |
| Language config | `server/src/features/judge/executor/languageConfig.js` |
| Cross-process events | `server/src/features/judge/judgeEvents.js` |
| Crash recovery | `server/src/features/judge/reconcile.js` |
| Submission REST API | `server/src/features/submission/` |

## Supported languages
Python 3.10, C++20 (GCC), Java 17 — resolved in `languageConfig.js`. Other `Language` enum
values are reported as `INTERNAL_ERROR` ("not supported yet") rather than faked.

## Execution flow (per submission)
1. Worker loads the submission + all test cases (sample first, then hidden).
2. Marks the submission `RUNNING`; publishes a `RUNNING` event.
3. **Compile phase** (C++/Java) or **syntax check** (Python) in a container. Non-zero exit →
   `COMPILATION_ERROR` with captured compiler output; execution stops.
4. **Execution phase**: each test case runs in its own container, stdin piped in, stdout/
   stderr/exit-code/time captured. Stops at the first failing case.
5. Per-test verdict via `determineVerdict()`; overall status is `ACCEPTED` if all pass,
   otherwise the first failure's verdict.
6. Persists an `ExecutionResult`, updates `Submission.status`, (contest) awards points on the
   first AC, and publishes a `COMPLETED` event with the verdict.

## Verdicts
`ACCEPTED`, `WRONG_ANSWER`, `RUNTIME_ERROR`, `COMPILATION_ERROR`, `TIME_LIMIT_EXCEEDED`,
`MEMORY_LIMIT_EXCEEDED`, `OUTPUT_LIMIT_EXCEEDED`, `INTERNAL_ERROR` (+ `CANCELLED`). Defined in
the `SubmissionStatus` Prisma enum and mirrored in `verdict.js`.

## Security measures

Every `docker run` (see `dockerExecutor.js`) applies the following. Each maps to a concrete
threat the milestone requires us to prevent:

| Threat | Mitigation |
|---|---|
| **Infinite loops** | Wall-clock timer per run → `docker kill` → `TIME_LIMIT_EXCEEDED` |
| **Fork bombs** | `--pids-limit 128` caps total processes/threads |
| **Memory exhaustion** | `--memory` + `--memory-swap` (equal → no swap); OOM kill → `MEMORY_LIMIT_EXCEEDED` |
| **CPU hogging** | `--cpus` quota |
| **Output floods / disk fill** | 1 MiB stdout cap → `OUTPUT_LIMIT_EXCEEDED`; `--ulimit fsize` caps bytes written |
| **File access / tampering** | `--read-only` rootfs; workdir bind-mounted **read-only** during the run phase; small capped `--tmpfs /tmp` |
| **Network access** (exfiltration, SSRF, DDoS) | `--network none` |
| **Shell escapes** | Commands passed as **argv** (no shell); `--cap-drop ALL`; `--security-opt no-new-privileges` |
| **Privilege escalation** | Non-root `--user 1000:1000`; no new privileges; all capabilities dropped |
| **State leakage between runs** | `--rm` auto-removes the container; fresh temp workdir per submission, deleted afterward |
| **API-server compromise** | Code never runs in the API process — only in the isolated worker + container |
| **File-descriptor exhaustion** | `--ulimit nofile=256` |

Additional app-level protections:
- **Hidden test cases** are never returned by any API to non-admins (`submissionDto.js`), and
  the lightweight Socket.IO event payload carries only aggregate counts — never per-test I/O.
- **No retries** on the queue (`attempts: 1`) — untrusted code is never silently re-run.
- **IDOR guards** on every submission read/cancel endpoint.

### ⚠️ Native dev fallback
`nativeExecutor.js` runs code directly on the host with only a timeout + output cap and **none**
of the Docker isolation. It is reachable **only** when `JUDGE_UNSAFE_LOCAL=1`, exists purely so a
developer without Docker can smoke-test the pipeline, and must never be enabled in production.

## Scaling
- Throughput scales horizontally: run more `judge-worker` replicas (each with
  `JUDGE_CONCURRENCY` slots). Redis is the shared broker; Socket.IO fan-out is decoupled via
  Redis pub/sub, so any worker can notify any connected client.
- Restart-safe: BullMQ persists jobs in Redis; on API boot `reconcilePendingSubmissions()`
  re-enqueues anything still `PENDING`.

## Running locally
```bash
docker compose up -d postgres redis
cd server && npm install && npm run prisma:generate && npm run prisma:push
docker pull python:3.10-slim gcc:13 eclipse-temurin:17-jdk   # or build server/docker/*
npm run dev      # API
npm run worker   # judge worker (separate terminal)
```
See `docs/JUDGE_VERIFICATION_REPORT.md` for the full verification checklist.
