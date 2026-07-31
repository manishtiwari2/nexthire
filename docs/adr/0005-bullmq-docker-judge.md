# ADR 0005: BullMQ + Docker Realization of the Judge

## Status
Accepted. Extends (does not supersede) [ADR-0003](0003-isolated-judge-queue.md).

## Context
ADR-0003 established the `IJudgeQueue` seam and explicitly anticipated "swapping the execution
backend to Redis / BullMQ or external sandboxed microservices". The initial `InMemoryJudgeQueue`
paired with a placeholder execution engine that returned hardcoded `ACCEPTED` verdicts — unusable
for NextHire's core value (accurate code execution). This ADR records the production realization.

## Decision
1. **Queue** — the in-memory queue is replaced by a **BullMQ** producer over **Redis**
   (`judgeQueue.js`), keeping the same `enqueueJob/getJobStatus/cancelJob` contract so the API
   call sites are unchanged. Jobs use the `submissionId` as the BullMQ job id (idempotent
   enqueue; deterministic cancel/rejudge). No retries — untrusted code is never silently re-run.
2. **Worker** — a **separate process** (`judgeWorker.js`) consumes the queue. The Express API
   never executes user code. The job core (`judgeProcessor.js`) is dependency-injected and
   unit-tested without Docker/Redis/DB.
3. **Sandbox** — every submission is compiled and run inside **throwaway Docker containers**
   (`dockerExecutor.js`) with no network, capped memory/CPU/pids/output, a read-only filesystem,
   a non-root user, dropped capabilities, and hard timeouts. A gated `JUDGE_UNSAFE_LOCAL` native
   fallback exists for Docker-less dev machines only.
4. **Realtime** — the worker publishes lifecycle events on a Redis channel; the API relays them
   over Socket.IO to the submitter's room (`submission:update`). The frontend is socket-first and
   only polls as a fallback.
5. **Schema** — `SubmissionStatus` gains `OUTPUT_LIMIT_EXCEEDED`, `INTERNAL_ERROR`, `CANCELLED`;
   `ExecutionResult` gains `language`, `runtimeOutput`, `stderr`, `exitCode`, and a `testResults`
   JSON breakdown.

## Consequences
- Verdicts are now derived from real execution; invalid code is correctly rejected and valid code
  correctly accepted.
- The system scales horizontally (more worker replicas) and survives restarts (Redis-persisted
  jobs + a boot reconciler).
- New operational dependencies: Redis and a Docker daemon on the worker host. The frozen
  application architecture (auth, question-bank, contest modules, 3NF schema) is unchanged.
