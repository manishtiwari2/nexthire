# NextHire — Performance Report

> Last reviewed 2026-07-31. Assessed by static analysis of query patterns and the request path.

## Backend

| # | Finding | Impact | Recommendation |
|---|---------|--------|----------------|
| P1 | Judge runs in-process on the API event loop | High | JS `vm` execution and (future) real execution block the loop; move to a separate worker/service. |
| P2 | `GET /contests` is unpaginated and eager-loads host + all questions + counts | Med | Grows linearly with contests; paginate + select only needed fields. |
| P3 | `updateContestStatuses()` issues 2 `updateMany` writes on **every** contest read (list & detail) | Med | Turns reads into writes; move to a scheduled job or compute status virtually. |
| P4 | `GET /questions` includes hints + all sample cases + tag joins for every row | Med | Over-fetching for a list view; trim includes; add `select`. |
| P5 | Leaderboard sort lacks a composite index | Low/Med | Add `@@index([contestId, score, penalty])`; also `ExecutionResult(submissionId)`. |
| P6 | In-memory judge queue is unbounded and process-local | Med | No backpressure; jobs lost on restart; use a real queue (BullMQ/Redis). |
| P7 | No caching (topics, question lists) | Low | Cache stable reads; add HTTP cache headers. |
| P8 | `memoryUsed`/`executionTime` are randomized values, not measurements | N/A | Metrics are fictitious; irrelevant until real judge. |

**Good**: `/questions` is paginated with a bounded `limit` (≤100) and runs `count`+`findMany` in
`Promise.all`; submission tables are well-indexed on `userId/questionId/contestId/interviewId`.

## Frontend

| # | Finding | Impact | Recommendation |
|---|---------|--------|----------------|
| F1 | Route-level code splitting via `React.lazy` | ✅ Positive | Keeps initial JS small. |
| F2 | Main vendor chunk ~256 kB (84 kB gzip) + Monaco ~65 kB | Low | Acceptable; Monaco lazy-loaded with the practice/contest pages. |
| F3 | Leaderboard polls every 5s unconditionally (even when tab hidden / no data) | Low | Pause on hidden tab; or push via socket. |
| F4 | Contest IDE fetches leaderboard even before the contest is entered | Low | Gate polling on an active session. |
| F5 | `useEditorStore` holds a single global `code` shared across all problems | Med (correctness+perf) | Switching problems can bleed code; key by question. |
| F6 | Search input triggers a query per keystroke (no debounce) | Low/Med | Debounce search → fewer requests. |
| F7 | Google Fonts + Material Symbols loaded from CDN render-blocking | Low | Self-host / `font-display: swap`. |

## Database
- Connection pooling is Prisma default; fine for a single instance. No N+1 detected in the main
  paths (Prisma `include` batches). Main concern is P3 (write-on-read) and P2 (unbounded list).

## Priorities
1. P1/P6 — get execution off the API process and onto a bounded external queue (also a security win).
2. P3 — stop writing on every contest read.
3. F5 — per-question editor state (also fixes a real correctness bug).
4. P2/P4 — paginate/trim heavy reads.
