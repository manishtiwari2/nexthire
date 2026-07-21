# ADR 0003: Isolated Queue-Based Code Execution Engine

## Status
Accepted (Frozen Architecture)

## Context
Executing untrusted user code (Python, JavaScript, C++) directly inside the primary Express API server poses severe security risks, event loop blocking, and resource starvation.

## Decision
1. We establish an `IJudgeQueue` interface (`enqueueJob(job: JudgeJob): Promise<string>`) that decouples submission ingestion from code evaluation.
2. An `InMemoryJudgeQueue` worker processes jobs asynchronously outside the API server's request-response lifecycle.
3. Execution outputs, memory usage, time elapsed, and test pass counts are written to a separate `ExecutionResult` database model.
4. The queue interface allows swapping the execution backend to Redis / BullMQ or external sandboxed microservices seamlessly.

## Consequences
- The Express API server remains responsive and safe under heavy submission load.
- Submissions support multiple execution records and rejudging without mutating submission metadata.
