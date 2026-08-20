# ADR-0005: PostgreSQL + Prisma with tracked migrations

## Status
Accepted.

## Context
NextHire's data is highly relational — users, questions, submissions, contests, progress, and their
many links — with rules best enforced by the database (uniqueness, foreign keys, cascades). A
deployment holds **real user submissions**, so schema changes need to be reviewable and reversible,
not silent rewrites.

## Decision
- Use **PostgreSQL 15** as the system of record, accessed via **Prisma 5** (`prisma-client-js`).
- Model the schema in `schema.prisma` (27 models, 14 enums) with explicit join tables for many-to-many
  relationships, `@@unique` constraints for business rules, and `onDelete: Cascade` where dependents
  should not outlive their parent.
- Apply the schema through **tracked migrations**, starting from a committed `0_init` baseline;
  `prisma migrate deploy` is the only command that should touch a production database.

## Alternatives considered
- **`prisma db push`** — convenient locally, but rewrites the database to match the schema with no
  history, no reviewable SQL, and nothing to roll back to. Kept for local iteration only; rejected for
  deployments. (This was the earlier approach.)
- **A different ORM / query builder** — Prisma's typed client and first-class migration workflow fit
  the schema-first, relational design.
- **A NoSQL store** — a poor fit for the relational integrity this data depends on. Rejected.

## Rationale
Documented in [`server/prisma/migrations/README.md`](../../server/prisma/migrations/README.md):
`db push` "rewrites the database to match `schema.prisma` with no history and no review step … wrong
for a deployment holding real submissions." The `0_init` baseline plus `migrate deploy` gives a
reviewable, roll-forward history.

## Consequences
- **Positive:** strong integrity guarantees at the database layer; typed data access; a reviewable
  schema history.
- **Negative / cost:** migration discipline is required (generate, commit, deploy). **In the current
  compose the API container does not run migrations automatically** (`npm start`); they must be
  applied out-of-band via `npm run prisma:migrate`. See
  [DATABASE.md](../DATABASE.md#migrations).

## Future
Wire `migrate deploy` into the deploy sequence (init container or entrypoint step) so schema
application is not a manual out-of-band step.
