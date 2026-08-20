# ADR-0001: Sandboxed judge in a separate BullMQ worker

## Status
Accepted.

## Context
NextHire's core promise is honest verdicts: user code must be **actually executed** against hidden
tests, with results reflecting real correctness, time, and memory. Running arbitrary untrusted code
creates two hard problems: (1) it must not compromise the host or reach the network, and (2) it must
not block or destabilise the API that also serves every other request.

## Decision
- Execute submissions in a **separate worker process** (`npm run worker`) that consumes a **BullMQ**
  queue backed by Redis. The API only **enqueues** (job id = submission id) and never runs user code.
- For each compile step and each test case, the worker launches a **throwaway Docker container** with
  strict isolation: `--network none`, `--read-only` root FS, `--tmpfs /tmp` (capped), `--user 1000:1000`,
  `--cap-drop ALL`, `--security-opt no-new-privileges`, memory/pids/cpu caps, `fsize`/`nofile` ulimits,
  and a wall-clock kill. Commands are argv arrays (no shell).
- Deliver verdicts by publishing to a Redis `judge:events` channel that the API relays to the
  submitter's Socket.IO room; the client falls back to polling if the socket/Redis is unavailable.
- Provide an **inline mode** (`JUDGE_INLINE=1`) for local development with no worker/Redis.

## Alternatives considered
- **In-process simulation / `node:vm`** — rejected: cannot produce honest time/memory verdicts and
  runs untrusted code in the API process. (This was the pre-rewrite state.)
- **Language-level sandboxes** (e.g. seccomp-only, interpreter restrictions) — insufficient isolation
  and per-language effort; containers give a uniform, strong boundary.
- **Third-party judge API** — introduces an external dependency, cost, and data-sharing concerns.

## Rationale
The rationale is documented directly in
[`server/src/features/judge/executor/dockerExecutor.js`](../../server/src/features/judge/executor/dockerExecutor.js):
each flag maps to a specific threat (exfiltration, disk-fill, fork-bomb, privilege escalation). The
queue/worker split keeps untrusted execution off the API event loop and allows judging to scale
independently.

## Consequences
- **Positive:** strong isolation; honest verdicts; horizontal scaling of judging
  (`--scale judge-worker=N`); queued jobs survive a Redis restart (`--appendonly`); a boot-time
  reconcile re-enqueues stranded submissions.
- **Negative / cost:** more moving parts (worker, Redis, Docker daemon); the worker mounts the host
  Docker socket, which is **root-equivalent**, so it must run on a host dedicated to judging; sandbox
  images must be pulled before first run or verdicts surface as `INTERNAL_ERROR`.

## Future
Support a rootless/remote Docker endpoint (`JUDGE_DOCKER_BIN` + `DOCKER_HOST`) to avoid the host-socket
mount; add more judged languages via `languageConfig` + images.
