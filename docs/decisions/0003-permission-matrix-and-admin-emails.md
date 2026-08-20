# ADR-0003: Permission matrix + `ADMIN_EMAILS`-derived admin

## Status
Accepted.

## Context
Authorization needs to be easy to extend (adding a capability shouldn't mean editing many route
files) and the admin model needs to be trustworthy — admin access should not be a mutable data value
that can drift or be set incorrectly in the database.

## Decision
- Routes declare the **permission** they require (`requirePermission('question:manage')`), not a role.
- A single table in [`server/src/shared/authz.js`](../../server/src/shared/authz.js) maps roles to
  permission lists (`GUEST` ⊂ `USER` ⊂ `ADMIN`). Adding a capability is a one-line edit there.
- The client receives its **resolved permission list** from `GET /auth/me` and never recomputes the
  matrix.
- **Effective admin is derived from the `ADMIN_EMAILS` deployment config on every sign-in.** An email
  on the list is `ADMIN`; an `ADMIN` whose email is removed is demoted on next login. Other roles are
  left as stored so an admin-assigned role survives.

## Alternatives considered
- **Role checks at each route** (`if role === 'ADMIN'`) — brittle and scattered; hard to add
  fine-grained capabilities. Rejected.
- **Admin flag stored only in the DB** — makes admin a mutable data value subject to drift and
  accidental grants; harder to reason about "who is admin" from deployment config. Rejected.

## Rationale
Documented in `authz.js`: "Routes declare the permission they need … so adding a capability later is
a change to this table and nothing else." Deriving admin from config makes it a deployment decision
re-evaluated each login, not a persisted value someone could flip in the database.

## Consequences
- **Positive:** capabilities are centralised and composable; client and server agree on the same
  permission names; admin membership is auditable from configuration and self-heals on removal.
- **Negative / cost:** admin membership must be managed via environment/config; a wrong `ADMIN_EMAILS`
  entry grants admin on next sign-in.
- **Related cleanup:** the former `INTERVIEWER` role (which granted a single permission for a feature
  never built) and the `CANDIDATE` role were removed/normalised; only `ADMIN` and `USER` remain.

## Future
None outstanding.
