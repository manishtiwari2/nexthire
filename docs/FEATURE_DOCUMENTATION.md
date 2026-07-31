# NextHire — Feature Documentation

> Status legend: ✅ shipped & working · ⚠️ partially working / caveats · ❌ not implemented (stub/missing)
> Last reviewed 2026-07-31.

## Authentication ⚠️
- **What**: Google Identity Services button + an email "sign-in" form; JWT stored in
  `localStorage`; `checkAuth()` calls `/auth/me` on app load.
- **Flow**: `GoogleLoginForm` → `useAuthStore.login/loginWithGoogle` → `/auth/*` → token + user.
- **Caveats**: passwordless auto-create; role by hardcoded email allowlist; Google credential
  decoded but not verified; single 7-day access token (no refresh despite README).
- **Files**: `features/auth/*` (server), `store/useAuthStore.ts`, `features/auth/components/GoogleLoginForm.tsx`, `pages/LoginPage.tsx`, `pages/RegisterPage.tsx`.

## Dashboard ❌
- No dashboard exists. `/` redirects to `/contests`. Sidebar imports a `LayoutDashboard` icon
  but there is no dashboard nav item or page. `GET /dashboard/stats` appears only in the swagger
  stub. ADR-0005 names a `dashboard` feature slice that was never built.

## Question Bank ✅ / ⚠️
- **What**: paginated, filterable table of questions (title, tags, topic, difficulty, limits) with
  a "Solve" link and admin delete.
- **Working**: search/difficulty/topic filters, pagination, delete (admin), navigation to practice.
- **Caveats**: the "Add Question (Admin)" button has **no `onClick`/route** — dead button. Update
  API is limited to 4 scalar fields. Tag/company-tag columns are usually empty (no write path).
- **Files**: `pages/QuestionBankPage.tsx`, `features/question-bank/components/*`, `features/question-bank/questionController.js`.

## Contest ⚠️
- **What**: contest list with join-by-code, and a live contest IDE (problem switcher + editor +
  polling leaderboard).
- **Working**: list, join-by-code (→ navigate to IDE), view problems, submit (enqueues), leaderboard poll.
- **Caveats**: "Create New Assessment" links to `/admin/contests/create` which **has no route**
  (→ redirect to `/contests`); leaderboard scores never change; contest detail leaks invite
  codes/emails publicly; problem points hardcoded as "100 pts" in UI.
- **Files**: `pages/ContestsPage.tsx`, `pages/LiveContestIDEPage.tsx`, `features/contest/*`.

## Interview ❌
- Fully modeled in the DB (`Interview`, `InterviewParticipant`, `InterviewReport`,
  `AIInterviewerSession`) and in `shared/types.ts`, and `requireInterviewHost` middleware exists,
  but there are **no routes, controllers, or pages**. WebRTC signaling handlers exist in the
  socket layer with no UI consumer.

## Profile ❌
- Header links to `/profile`; `getMe` returns profile + skills; but there is **no profile page**
  and no `GET/PUT /users/profile` API. `Profile.rank/streak` exist in `shared/types.ts` but not
  in the Prisma schema.

## Analytics ❌
- No analytics feature. No telemetry, no charts, no `/dashboard/stats` route.

## Revision (SM-2 Spaced Repetition) ⚠️→❌
- **What (UI)**: a card in the practice page with Hard/Good/Easy/Perfect buttons that POST a
  confidence rating.
- **Reality**: posts to `POST /revision/review`, which **returns 404**. The SM-2 algorithm is
  implemented **only in a unit test** (`test/practiceIde.test.js`), not in any route. The
  `RevisionSchedule` table is never read or written at runtime.
- **Files**: `features/revision/components/RevisionScheduleCard.tsx`, `test/practiceIde.test.js`.

## Notifications ⚠️
- **What (client)**: an in-memory toast system (`useNotificationStore` + `ToastContainer`) that
  auto-dismisses after 5s. This works for local UX toasts.
- **Missing**: no persistent notifications; header bell links to `/notifications` (**no route**);
  no `GET /notifications` or `POST /notifications/broadcast` API despite README.
- **Files**: `store/useNotificationStore.ts`, `components/layout/ToastContainer.tsx`.

## Settings ❌
- Header links to `/settings/editor` (**no route**). Editor settings (theme/font/language) live
  in `useEditorStore` and are changed inline in the editor toolbar, not on a settings page.

## Admin ⚠️
- **What**: admins get an "Admin Suite" sidebar section and a question delete control; role is
  reflected in header/sidebar badges.
- **Missing**: the only admin nav item ("Create Assessment") points to a **non-existent route**;
  there is no admin UI to create questions or contests, manage invites, or moderate users.
  All admin creation must be done via raw API calls.

## Judge ❌ (simulated)
- **What (intended)**: isolated queue-based multi-language execution recording `ExecutionResult`.
- **Reality**: `InMemoryJudgeQueue` → `JudgeWorkerService` runs jobs on a single in-process async
  loop. `executionEngine.runCodeInSandbox` uses `node:vm` for JS (and **force-passes** even when
  a test throws) and returns hardcoded success for Python/C++/Java/other. Verdicts are not real;
  invalid code returns `ACCEPTED` (verified). `judgeWorker.js` is a dead duplicate.
- **Files**: `features/judge/*`.

## Storage ❌ (unused)
- `IStorageProvider` + `LocalStorageProvider` (TypeScript) define file uploads to `./uploads`.
  No route uses them, and the backend has no TS build step, so they cannot run as written.
  `/uploads` static middleware is mounted but nothing writes there.

## Socket.IO ⚠️
- **What**: JWT-authenticated rooms with `join-room`, `code-change`→`code-update`,
  `send-message`→`receive-message`, `video-signal`.
- **Working**: code sync in the contest IDE room (`CONTEST-<id>`).
- **Caveats**: no room-membership authorization (any authed user can join any room); chat and
  video signaling have no frontend consumers; the practice page never passes a `roomCode`, so
  practice is single-player only.
- **Files**: `socket/socketHandler.js`, `components/editor/MonacoCodeEditor.tsx`.
