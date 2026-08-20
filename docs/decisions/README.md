# Architecture Decision Records

Each record captures a significant, hard-to-reverse decision: its context, what was decided, the
alternatives, and the consequences. Where the original rationale could not be recovered from code or
docs, the record says so explicitly rather than inventing one.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-sandboxed-judge-bullmq-worker.md) | Sandboxed judge in a separate BullMQ worker | Accepted |
| [0002](0002-in-memory-access-token-rotating-refresh.md) | In-memory access token + rotating refresh cookie | Accepted |
| [0003](0003-permission-matrix-and-admin-emails.md) | Permission matrix + `ADMIN_EMAILS`-derived admin | Accepted |
| [0004](0004-feature-sliced-architecture.md) | Feature-sliced module architecture | Accepted |
| [0005](0005-postgresql-prisma-tracked-migrations.md) | PostgreSQL + Prisma with tracked migrations | Accepted |
| [0006](0006-run-vs-submit-server-authoritative-submissions.md) | Run/Submit split + server-authoritative submission fields | Accepted |
