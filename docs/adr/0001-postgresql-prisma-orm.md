# ADR 0001: PostgreSQL Database & Prisma ORM Data Architecture

## Status
Accepted (Frozen Architecture)

## Context
NextHire requires a reliable, relational database system capable of supporting complex queries, relational join models (`ContestQuestion`, `QuestionTagMap`, `ExecutionResult`), dynamic aggregations for analytics, and transaction isolation.

## Decision
We select **PostgreSQL** as the primary database engine alongside **Prisma ORM** as the query builder and migration tool.

## Consequences
- Strict relational constraints and 3NF normalization enforced at the database level.
- Type-safe query builder interfaces generated automatically via `@prisma/client`.
- Migration history tracked deterministically under `server/prisma/migrations`.
