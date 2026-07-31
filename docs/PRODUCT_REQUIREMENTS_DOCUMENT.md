# NextHire — Product Requirements Document (PRD)

> Status: Draft for pre-launch review · Owner: Product · Last reviewed: 2026-07-31
>
> This PRD documents the product **as it actually exists in the codebase today**, then
> separates aspirational scope (README/ADR claims) from shipped functionality. Where the
> code and the marketing copy disagree, the code is treated as the source of truth and the
> gap is called out explicitly.

---

## 1. Vision

Give developers a single place to **practice data-structure & algorithm (DSA) problems** and
**compete in timed coding assessments**, with a LeetCode-style practice IDE and a lightweight
contest engine that recruiters/hosts can spin up on demand.

## 2. Product Overview

NextHire is a full-stack web application:

- **Frontend** — React 18 + TypeScript + Vite SPA. Tailwind CSS v4 design tokens, Monaco
  editor, TanStack Query for server state, Zustand for auth/editor/notification client state.
- **Backend** — Node.js/Express REST API (`/api/v1`, with unversioned aliases), Prisma ORM
  over PostgreSQL, Socket.IO for room-based real-time sync, and an in-process asynchronous
  "judge" worker that records execution results.

The **shipped** surface is two workflows:

1. **Question Bank + Practice IDE** — browse/filter questions, open a problem, write code in
   Monaco, "Run"/"Submit", view submission history, and rate confidence for SM-2 revision.
2. **Contests** — list contests, join by invite code, enter a live contest IDE with a
   problem switcher and a leaderboard that polls every 5s.

> **Reality check.** Several capabilities named in the README/ADRs are **not implemented**:
> mock interviews, notifications API, user profile API, analytics/dashboard API, admin
> contest-creation UI, spaced-repetition persistence API, and a *real* code judge. See
> §14 (Gap Register). The repository README itself ends with "The app is still in progress".

## 3. Goals

| # | Goal | Measurable outcome |
|---|------|--------------------|
| G1 | Let candidates practice DSA problems in-browser | Candidate can open a question, edit code, and submit |
| G2 | Provide topic/difficulty/search filtering over a question bank | Filters return correctly paginated results |
| G3 | Host and join timed contests | Host creates a contest (API); candidate joins by code and sees a leaderboard |
| G4 | Give real-time collaboration primitives | Socket rooms sync code + chat + WebRTC signaling |
| G5 | Model spaced repetition (SM-2) for retention | Confidence rating schedules a next-review date |

## 4. Non-Goals (current release)

- Building a hardened, sandboxed multi-language execution engine (currently simulated).
- Full applicant-tracking / recruiting CRM features.
- Payment / subscription billing ("Upgrade to Pro" is a placeholder toast).
- Mobile-native apps.
- AI hinting / AI interviewer (schema reserves tables; no runtime).

## 5. Target Users & Personas

| Persona | Description | Primary jobs-to-be-done | Supported today? |
|---------|-------------|-------------------------|------------------|
| **Alex — Candidate** | Job-seeking developer practicing DSA | Solve problems, track history, join contests | ✅ Partial |
| **Anuradha — Platform Admin** | Operates the platform | CRUD questions, create contests, moderate | ⚠️ API only; no admin UI for create |
| **Contest Host** | Runs a private assessment | Create contest, share invite code, watch leaderboard | ⚠️ API only |
| **Interviewer** | Conducts a live interview | Schedule interview, evaluate candidate | ❌ Not implemented |
| **Recruiter** | Reviews candidate performance | View reports/analytics | ❌ Not implemented |

## 6. Functional Requirements

### 6.1 Authentication & Authorization
- FR-A1: Users authenticate via Google Identity Services **or** an email "sign-in" form.
- FR-A2: Roles are `ADMIN` or `CANDIDATE`. Role is derived from a **hardcoded email allowlist**
  (`anuradha@admin.at`, `manish@admin.mt`) at login/creation time and persisted on `User.role`.
- FR-A3: JWT (7-day expiry) encodes `{id, email, name, role}`; middleware authorizes from the
  token payload without re-querying the DB.
- FR-A4: Protected client routes redirect unauthenticated users to `/login`.

> **Defect:** FR-A1 currently **auto-creates any account with no password check** — there is no
> password field in the schema at all. Any email logs in successfully. See Security Report.

### 6.2 Question Bank
- FR-Q1: List questions with pagination (`page`, `limit≤100`), `search`, `difficulty`,
  `topicId`, `tagId` filters.
- FR-Q2: Fetch a single question with topic, starter code, test cases, hints, editorial, tags.
- FR-Q3: Admins can create/update/delete questions.
- FR-Q4: Any authenticated user can execute code against a question.
- FR-Q5: Candidates can view their own submission history for a question.

> **Defects:** FR-Q2 endpoint is **unauthenticated and returns hidden (non-sample) test cases
> and full editorial solutions** — see Security Report. FR-Q3 `updateQuestion` only edits four
> scalar fields; it cannot update test cases, starter code, hints, or the topic.

### 6.3 Contests
- FR-C1: List contests; status auto-transitions UPCOMING→LIVE→ENDED based on time on read.
- FR-C2: Fetch a contest with questions, participants (ranked), and invites.
- FR-C3: Admins create contests; a `DSA-XXXXXX` invite code is generated.
- FR-C4: Users join by contest id (`/:id/join`) or global code (`/join-by-code`).
- FR-C5: Participants submit code; heartbeat is recorded.
- FR-C6: Leaderboard is ordered by `score` desc, `penalty` asc.

> **Defect:** FR-C6 leaderboard **never changes** — no code path ever writes `score` or
> `penalty` (a comment claims "score is updated by judge worker on ACCEPTED result", but the
> worker contains no such logic). FR-C2 leaks invite codes + participant emails to anonymous users.

### 6.4 Practice IDE
- FR-I1: Monaco editor with language + theme selectors and font size.
- FR-I2: Autosave code drafts to `localStorage` (1s debounce), restore on mount.
- FR-I3: "Run Code" executes against sample cases; "Submit Code" enqueues a judged submission.
- FR-I4: Description / Hints / Editorial / History / SM-2 tabs.

> **Defect:** FR-I3 "Submit" **fabricates an `ACCEPTED` result in the client** regardless of
> the backend verdict, and the underlying judge marks essentially all code `ACCEPTED`.

### 6.5 Real-time
- FR-R1: Socket rooms for `join-room`, `code-change`→`code-update`, `send-message`, `video-signal`.
- FR-R2: Socket connections require a valid JWT in the handshake.

> **Defect:** the practice/contest UI wires `code-change` emit but only the contest IDE passes a
> `roomCode`; chat and video signaling have **no UI consumer** at all.

### 6.6 Spaced Repetition (SM-2)
- FR-S1: Candidate rates confidence (2/3/4/5) → next review interval scheduled.

> **Defect:** the client calls `POST /revision/review`, which **does not exist** (404). The
> SM-2 algorithm exists only inside a unit test, not in any route/controller.

## 7. Non-Functional Requirements

| ID | Requirement | Current state |
|----|-------------|---------------|
| NFR-1 Security | Untrusted code must not compromise the server | ❌ Code runs in `node:vm` (not a sandbox) on the API event loop |
| NFR-2 Security | Sensitive data behind authz | ❌ Question/contest detail endpoints are public |
| NFR-3 Availability | API stays responsive under submission load | ⚠️ Judge runs in-process; single async queue |
| NFR-4 Performance | List endpoints paginated & indexed | ✅ Questions paginated; ⚠️ contests unpaginated |
| NFR-5 Observability | Errors traceable | ❌ `console.log` only; no structured logging/metrics |
| NFR-6 Accessibility | WCAG-AA basics | ⚠️ Partial; icon-only controls, low-contrast tokens |
| NFR-7 Config | No secrets in VCS | ❌ `.env` with a real `JWT_SECRET` is committed |
| NFR-8 Portability | Runs locally with minimal setup | ⚠️ Requires Postgres; schema is Postgres-only despite "SQLite" claim |

## 8. User Stories & Acceptance Criteria (representative)

- **US-1** *As a candidate, I can filter questions by difficulty so I can practice at my level.*
  - AC: selecting "Medium" returns only `MEDIUM` questions; pagination resets to page 1. ✅
- **US-2** *As a candidate, I submit a solution and see whether it passed.*
  - AC: the verdict reflects real test execution. ❌ (verdict is simulated)
- **US-3** *As a host, I create a contest and share a join code.*
  - AC: a UI exists to create a contest. ❌ (button routes to a non-existent page)
- **US-4** *As a candidate, my contest score updates as I solve problems.*
  - AC: solving increases score/rank. ❌ (score never changes)
- **US-5** *As any user, I cannot see another problem's hidden test cases.*
  - AC: hidden cases require authz and are stripped for solvers. ❌ (publicly readable)

## 9. Success Metrics & KPIs

| KPI | Target (first 90 days) |
|-----|------------------------|
| Activation: % new users who submit ≥1 solution | ≥ 60% |
| Practice retention: D7 return rate | ≥ 25% |
| Contest completion rate | ≥ 70% of joiners submit ≥1 |
| Judge correctness (once real) | 100% deterministic verdicts |
| p95 API latency (list/detail) | < 300 ms |
| Error rate (5xx) | < 0.5% |

> None of these are currently measurable — there is no analytics/telemetry pipeline.

## 10. Future Roadmap

1. **P0 — Real judge**: containerized/sandboxed execution with resource limits; real verdicts.
2. **P0 — Auth**: password credentials (bcrypt) or true OAuth token verification; remove auto-create.
3. **P0 — Authorization hardening**: protect detail endpoints; strip hidden data.
4. **P1 — Contest scoring engine**: award points/penalty on accepted submissions; rank persistence.
5. **P1 — Admin UI**: question editor (full), contest creation, invite management.
6. **P1 — Persist SM-2**: `/revision` routes backed by `RevisionSchedule`.
7. **P2 — Interviews**: implement the reserved interview schema end-to-end (WebRTC + reports).
8. **P2 — Notifications & profile**: back the linked UI pages with real APIs.
9. **P2 — Observability**: structured logging, metrics, error tracking.

## 11. Risks

| Risk | Severity | Notes |
|------|----------|-------|
| Untrusted code execution on API host | Critical | `vm` is not a security boundary |
| Passwordless auth / hardcoded admin allowlist | Critical | Anyone can log in; admin by email string |
| Public leakage of hidden test cases/editorials/PII | High | Detail endpoints unauthenticated |
| Committed secret (`.env`, `JWT_SECRET`) | High | Rotate + purge from history |
| Product/marketing overclaim vs. implementation | High | README advertises unbuilt features |
| Fake verdicts undermine core value prop | Critical | Practice/contest results are meaningless |

## 12. Assumptions

- Single-tenant, single-region deployment for launch.
- PostgreSQL is the production datastore (Docker compose provided).
- Google Identity is the intended primary auth; email form is a dev convenience.

## 13. Constraints

- Backend is JavaScript (CommonJS), not TypeScript; two `.ts` storage files are unused/uncompiled.
- Schema `provider = "postgresql"` — the "zero-config SQLite" path in the README is not wired.
- No CI configuration exists in the repository.

## 14. Gap Register (README/ADR claim → reality)

| Claimed | Reality |
|---------|---------|
| "bcrypt password hashing", "Access + Refresh Tokens" | No password field; single access token; no refresh flow |
| "Python & JavaScript code sandbox runner evaluating test cases" | Simulated; JS uses `vm` and force-passes; Python/C++/Java are stubs |
| Interviews API (`/api/interviews...`), reports | Not routed (404) |
| Profile & Notifications API | Not routed (404) |
| `POST /notifications/broadcast` | Not routed (404) |
| Dashboard/analytics stats | Not routed (404); only referenced in swagger stub |
| Seed script / demo credentials | Seed scripts removed (see git history); demo creds won't work |
| SQLite zero-config | Schema is Postgres-only |
| Refresh tokens | Not implemented |
