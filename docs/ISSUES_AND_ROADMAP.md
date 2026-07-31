# NextHire — Issue Register, Fixes, Remaining Risks & Roadmap

> Last reviewed 2026-07-31. Cross-references the Security, Performance, Production Readiness,
> and Technical Debt reports.

## A. Every issue found (master register)

### Critical
| ID | Area | Issue |
|----|------|-------|
| C1 | Judge | Untrusted code runs via `node:vm` on the API process; not a sandbox; can block/crash the server. |
| C2 | Judge | Verdicts are simulated — JS force-passes even on thrown tests; Python/C++/Java are stubs; invalid code returns `ACCEPTED` (verified). |
| C3 | Auth | Passwordless auto-create: any email logs in; no password column exists (verified). |
| C4 | Auth | Google `credential` is `jwt.decode`d without signature verification (forgeable). |
| C5 | Contest | Leaderboard is meaningless — `score`/`penalty`/`rank` are never written. |

### High
| ID | Area | Issue | Status |
|----|------|-------|--------|
| H1 | Authz | `GET /questions/:id` public; leaks hidden test cases + editorial (verified). | **Fixed** |
| H2 | Authz | `GET /contests/:id` public; leaks invite codes + participant emails (verified). | **Fixed** |
| H3 | Authz | IDOR on `GET /questions/submission/:id` (any user reads any submission code). | **Fixed** |
| H4 | Auth | Admin role by hardcoded email allowlist. | Documented |
| H5 | Secrets | `.env` with real `JWT_SECRET` + DB creds committed to VCS. | Documented |
| H6 | Product | README/ADR/swagger advertise many unimplemented features. | Partially (docs corrected in `/docs`) |

### Medium
| ID | Area | Issue | Status |
|----|------|-------|--------|
| M1 | Client | "Submit" fabricated an `ACCEPTED` verdict regardless of backend. | **Fixed** (now polls real result) |
| M2 | Client | "Run" displayed the queue envelope, not a real result. | **Fixed** (now polls real result) |
| M3 | Editor | Global `code` state shared across all questions (wrong code on switch). | Documented |
| M4 | Nav | Dead links/buttons: `/admin/contests/create`, `/notifications`, `/profile`, `/settings/editor`, "Add Question". | Documented |
| M5 | API | `/revision/review` 404 (SM-2 UI calls a non-existent endpoint). | Documented |
| M6 | Errors | Controllers return raw internal error messages. | Documented |
| M7 | Validation | `zod` installed but unused; no input validation; no rate limiting. | Documented |
| M8 | Perf | `updateContestStatuses()` writes on every contest read. | Documented |
| M9 | Perf | `GET /contests` unpaginated + over-fetching. | Documented |
| M10 | Sockets | No room-membership authorization. | Documented |
| M11 | Contest | Invite `expiresAt` never enforced; `join-by-code` ignores `maxUses`. | Documented |
| M12 | TS | Two real type errors (editor language comparison; `pagination` on AxiosResponse). | **Fixed** |
| M13 | Ops | No CI; no app Dockerfile; no committed migrations (`db push` only). | Documented |

### Low
| ID | Area | Issue | Status |
|----|------|-------|--------|
| L1 | Dead code | `judgeWorker.js` duplicate. | **Removed** |
| L2 | Dead code | `client/src/App.css` Vite starter styles. | **Removed** |
| L3 | Repo hygiene | `contest_debug.json`, `contest_detail.json` committed debug artifacts. | **Removed** |
| L4 | Dead code | `shared/storage/*.ts` + `shared/types.ts` unused; type/schema drift. | Documented |
| L5 | Lint | Many unused imports/vars (oxlint warnings). | Documented |
| L6 | UX | No debounce on search; leaderboard polls when hidden. | Documented |
| L7 | Config | 3 disagreeing JWT-secret defaults; CORS default port `:5173` vs Vite `:3000`. | Documented |
| L8 | A11y | Icon-only controls, sub-AA contrast tokens, no skip links. | Documented |

## B. Every issue fixed in this pass (with verification)

1. **H1 — Hidden test case / editorial leak.** `GET /questions/:id` now requires authentication;
   `getQuestionById` strips non-sample test cases for non-admins. *Verified*: anonymous → `401`;
   candidate sees 0 hidden cases; admin sees the full suite.
2. **H2 — Contest invite/PII leak.** `GET /contests/:id` now requires authentication;
   `getContestById` returns `invites` only to the host/admin. *Verified*: anonymous → `401`;
   candidate sees the contest with `invites: []`; title/questions still present.
3. **H3 — Submission IDOR.** `getSubmissionResult` now returns `403` unless the caller owns the
   submission or is an admin. *Verified*: second candidate → `403`.
4. **M1/M2 — Honest verdicts.** `MonacoCodeEditor` no longer fabricates results; both Run and
   Submit poll `GET /questions/submission/:id` for the real execution record and display it.
   *Verified*: submit → poll returns actual `ExecutionResult` (status/passCount/output).
5. **M12 — TypeScript errors.** Expanded `SupportedLanguage` to all six offered languages,
   replaced the invalid nested-ternary Monaco mapping with a typed lookup map, and corrected the
   `pagination` access in `QuestionBankPage`. *Verified*: `tsc --noEmit` clean; `vite build` OK.
6. **L1/L2/L3 — Dead code & artifacts removed** (`judgeWorker.js`, `App.css`, two debug JSONs).

All changes verified against: `tsc --noEmit` (0 errors), `vite build` (success), all 6 server
tests passing, oxlint (0 errors), and live API reproduction.

## C. Remaining risks (not fixed — require larger work or product decisions)

- **C1/C2 (Critical) — Real judge**: the code executor must be replaced with an isolated,
  resource-limited sandbox in a separate process/service, and made to produce genuine verdicts.
  This is a substantial subsystem; intentionally out of scope for a safe review pass.
- **C3/C4/H4 (Critical/High) — Authentication**: implement real credentials (bcrypt) or verified
  Google OAuth, remove account auto-create, and stop deriving admin from an email allowlist.
  Requires a schema change (`passwordHash`) and a migration.
- **C5 (Critical) — Contest scoring**: implement the score/penalty write path on accepted
  submissions (depends on a real judge to be meaningful).
- **H5 (High) — Secret hygiene**: rotate `JWT_SECRET` + DB password and purge `.env` from git
  history. Cannot be done safely from a code pass; requires operator action.
- **M4/M5 — Missing pages/APIs**: admin create UI, profile, notifications, settings, and the
  `/revision` API are unbuilt features, not simple bug fixes.

## D. Improvement roadmap (prioritized)

**Phase 0 — Security stop-the-bleed (1–2 wks)**
- Real auth (passwords or verified OAuth); remove auto-create + email-allowlist admin.
- Rotate + purge committed secrets; add `helmet`, rate limiting, zod validation.
- (Done in this pass: detail-endpoint authz, IDOR, honest client verdicts.)

**Phase 1 — Make the core real (2–4 wks)**
- Isolated sandboxed judge (container/microVM/`isolated-vm`) with CPU/mem/time limits, external
  bounded queue (BullMQ/Redis), genuine verdicts and metrics.
- Contest scoring engine (points on accept, penalty on wrong, rank persistence).
- Per-question editor state; enforce invite limits/expiry.

**Phase 2 — Close the product gaps (3–5 wks)**
- Admin UIs (full question editor, contest creation, invites, moderation).
- SM-2 `/revision` API backed by `RevisionSchedule`; profile + notifications APIs and pages.
- Reconcile or remove the reserved interview/AI schema.

**Phase 3 — Operational maturity (ongoing)**
- App Dockerfile + CI (tsc + lint + tests + build + integration tests); committed Prisma
  migrations; structured logging + metrics + error tracking; accessibility audit to WCAG-AA.
