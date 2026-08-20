# ADR-0004: Feature-sliced module architecture

## Status
Accepted.

## Context
The codebase spans several distinct domains — auth, question bank, submissions, contests, library,
revision, judge. Organising by technical layer (all controllers together, all services together)
tends to scatter a single feature across the tree and makes it hard to see or change a feature as a
unit.

## Decision
Organise both server and client **by feature**:
- **Server:** `server/src/features/<feature>/` owns that feature's routes, controllers, services,
  validators, and DTOs. Cross-cutting concerns live in `server/src/shared/` (auth middleware,
  authz, db client, rate limiter, docs).
- **Client:** each feature owns its pages/components/hooks; shared UI primitives and utilities live
  under `client/src/shared/`.

## Alternatives considered
- **Layer-first** (`controllers/`, `services/`, `models/`) — familiar, but spreads each feature
  across many folders and couples unrelated features through shared layer directories. Rejected.

## Rationale
> The original rationale is not documented in a dedicated note; the following is an inferred
> reconstruction based on the code layout.

Feature slices keep everything needed to understand or change a capability in one place, make
ownership obvious, and let features evolve with minimal blast radius. The consistent `features/<x>/`
structure across the server (and its mirror on the client) is the observable evidence of this choice.

## Consequences
- **Positive:** high cohesion per feature; a new capability is a new folder plus a route mount;
  clear boundaries between domains.
- **Negative / cost:** some small utilities are duplicated or must be deliberately promoted to
  `shared/`; contributors must know where the shared boundary is.

## Future
None outstanding.
