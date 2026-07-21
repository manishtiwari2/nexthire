# ADR 0002: JWT Authentication & Database-Persisted Role Assignment

## Status
Accepted (Frozen Architecture)

## Context
NextHire requires user authentication via Google OAuth and email login, with role-based access control (`ADMIN` vs `CANDIDATE`).

## Decision
1. Roles are evaluated upon user creation/login. Emails `anuradha@admin.at` and `manish@admin.mt` are granted `ADMIN` role; all other accounts receive `CANDIDATE` role.
2. The user's role is stored directly in the PostgreSQL database (`User.role`).
3. Authentication tokens (JWT) encode the `role` directly inside the payload.
4. Authorization middlewares (`requireAdmin`, `requireAuthenticated`, `requireContestHost`, `requireInterviewHost`) evaluate permissions directly from the signed JWT payload without re-querying or re-inferring email rules.

## Consequences
- Fast, zero-database-lookup permission evaluation on every REST request.
- Centralized role persistence in PostgreSQL.
