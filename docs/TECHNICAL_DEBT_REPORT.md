# NextHire — Technical Debt Report

> Last reviewed 2026-07-31.

## Dead / duplicate / unused code
- `server/src/features/judge/judgeWorker.js` — a near-duplicate of `JudgeWorkerService.processJob`,
  **imported nowhere**. *(Removed in this pass.)*
- `server/src/shared/storage/*.ts` — `IStorageProvider`/`LocalStorageProvider` unused and
  uncompiled (no TS build on the backend). Dead until an upload feature exists.
- `shared/types.ts` — not imported by client or server; drifts from the Prisma schema
  (`Profile.rank/streak`, `InterviewReport.rubricScores.systemDesign` shapes differ).
- `client/src/App.css` — leftover Vite starter styles, unused.
- Debug artifacts committed at repo root: `contest_debug.json`, `contest_detail.json`.
  *(Removed in this pass.)*
- Numerous unused imports/vars flagged by oxlint (Sparkles, Filter, Award, useMutation, etc.).
  *(A subset cleaned where it overlapped with fixed files.)*

## Correctness debt
- **Fake judge verdicts** — the single largest source of debt; every downstream feature (history,
  leaderboard, SM-2 value) is built on meaningless results.
- **Static leaderboard** — `score`/`penalty`/`rank` never written.
- **Shared editor `code` state** across questions (`useEditorStore`) can show the wrong code when
  switching problems.
- **Client fabricates `ACCEPTED`** on submit regardless of backend. *(Fixed to be honest in this pass.)*
- **`updateQuestion`** cannot edit relational children (test cases, starter code, hints, editorial).
- **Invite `expiresAt`** never enforced; `join-by-code` ignores `maxUses`/`usedCount`.

## Type / config debt
- Backend is CommonJS JS while two `.ts` files exist with no compiler — mixed module strategy.
- `client/tsconfig.json` has `strict:false`, `noUnusedLocals:false` — masks real issues.
- Two real TS errors existed (editor language comparison; `pagination` on `AxiosResponse`).
  *(Fixed in this pass.)*
- Three independent JWT secret defaults (`.env` value, middleware fallback, controller fallback)
  that disagree.
- Schema is Postgres-only despite README's SQLite claim.

## Testing debt
- Tests re-implement logic instead of importing it (`auth.test.js` copies `determineRole`;
  `contestEngine.test.js` copies the sort; `practiceIde.test.js` copies SM-2) — they can pass
  while the real code is broken. No API/integration/E2E tests. No test runner, no coverage, no CI.

## Documentation debt
- README advertises features that don't exist (interviews, notifications, profile, refresh
  tokens, bcrypt, sandbox judge, seed script, SQLite) and lists demo credentials that won't work.
- ADRs describe a "frozen" architecture whose security/judge intent the code does not meet.
- Swagger stub lists endpoints (`/interviews`, `/dashboard/stats`) that 404.

## Process debt
- Uses `prisma db push` (no migration history) — ADR-0001 claims tracked migrations under
  `server/prisma/migrations`, which does not exist.
- No CI/lint/test gates; lint is `oxlint` with a minimal ruleset.

## Suggested paydown order
1. Remove dead code & debug artifacts (low risk). *(Started.)*
2. Fix the two TS errors + editor language/type + per-question code state.
3. Make tests import real code; add API integration tests for auth/questions/contests.
4. Reconcile README/ADRs/swagger with reality (or implement the gaps).
5. Adopt Prisma migrations; add CI running tsc + lint + tests + build.
