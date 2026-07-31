# NextHire — Production Readiness Report

> Last reviewed 2026-07-31. Scores are 0–10 (10 = production-ready). Weighted total in the
> Executive Summary. This audit treats the *shipped code* as the product.

## Category scorecard

| Category | Score | Rationale |
|----------|:----:|-----------|
| **Frontend** | 6/10 | Clean, componentized, code-split, consistent design tokens. But dead links/buttons, no error boundaries, shared editor state bug, missing loading/empty/error states in places. |
| **Backend** | 4/10 | Reasonable feature-sliced structure, but no service layer, no validation, raw error leakage, write-on-read, and core verdicts are fake. |
| **Database** | 7/10 | Well-normalized (3NF), good FKs/uniques/indexes on hot paths. Loses points for large unused reserved surface, missing password model, and type/schema drift. |
| **Infrastructure** | 2/10 | Only a Postgres compose file. No app Dockerfile, no process manager, no reverse proxy/TLS, no env separation. |
| **Security** | 1/10 | Passwordless auth, unverified OAuth, committed secret, public data leaks, unsandboxed code execution. Multiple critical issues (see Security Report). |
| **Testing** | 2/10 | 6 tiny pure-function unit tests that mostly **re-implement** logic rather than import it (auth test copies `determineRole`); no integration/API/E2E tests; no runner/coverage. |
| **Deployment** | 2/10 | No CI, no build/release pipeline, no migrations committed (uses `db push`), manual multi-terminal startup. |
| **Monitoring** | 1/10 | `console.log` only. No structured logs, metrics, tracing, health-driven alerting, or error tracking. |
| **Accessibility** | 5/10 | Semantic-ish markup, some `aria-label`s, focus rings. But icon-only controls, non-AA contrast in token palette, no keyboard testing, no skip links, tables without captions. |
| **Performance** | 6/10 | Good pagination + code splitting; hurt by write-on-read, in-process judge, and unpaginated contests. |
| **Scalability** | 3/10 | Single process couples API + sockets + judge; in-memory queue; no horizontal-scale story (sticky sessions, shared queue). |
| **Maintainability** | 6/10 | Symmetrical feature slices, small files, readable. Hurt by dead code, duplicated judge logic, JS backend without types, no validation layer. |
| **Developer Experience** | 5/10 | Simple to read; but broken README instructions (seed removed, wrong ports/SQLite), no CI, `.ts` files that don't compile, lint warnings. |

## Blockers to production (must-fix)
1. **Real, isolated code judge** with resource limits and honest verdicts (Security S1, Feature Judge).
2. **Authentication**: passwords or verified OAuth; remove auto-create and email-allowlist admin.
3. **Authorization**: protect detail endpoints, strip hidden data, fix submission IDOR.
4. **Secret hygiene**: purge/rotate `.env` and `JWT_SECRET`.
5. **Contest scoring**: implement the score/penalty write path (core value).
6. **Kill dead/false UI**: remove or implement dead links/buttons and fabricated verdicts.

## Should-fix before scale
- Structured logging + metrics + error tracking; app Dockerfile + CI; committed Prisma migrations;
  input validation; rate limiting; per-question editor state; paginate contests; move judge to an
  external bounded queue.

## Nice-to-have
- Interviews, notifications, profile, analytics, admin UIs (fulfilling the advertised surface);
  accessibility audit to WCAG-AA; self-hosted fonts.

## What is genuinely good
- Coherent feature-sliced architecture on both tiers; clean 3NF schema; sensible auth middleware
  for mutations; code-split React with a consistent design system; ADRs documenting intent.
