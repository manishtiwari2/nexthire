# NextHire - Full-Stack SaaS Developer Interview Platform

NextHire is a production-ready, full-stack technical interview and coding contest platform built with **React 18**, **TypeScript**, **Node.js/Express**, **Prisma ORM**, **Socket.IO**, **Monaco Editor**, **TanStack Query**, and **Zustand**.

---

## 🛠️ Architecture & Tech Stack

### **Frontend (`client/`)**
- **Framework & Build**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS v4 + Stitch UI Design Tokens
- **State Management**: TanStack Query (Server State caching), Zustand (Auth & Editor Client State)
- **Code Editor**: Monaco Editor (`@monaco-editor/react`)
- **Real-Time Sync**: Socket.IO Client (live cursor sync & chat)
- **Routing & Forms**: React Router v6, React Hook Form, Zod

### **Backend (`server/`)**
- **Server**: Node.js, Express.js
- **Database & ORM**: Prisma ORM with SQLite (zero-config local running) & PostgreSQL compatibility
- **Authentication**: Dual JWT Access + Refresh Tokens, bcrypt password hashing
- **Code Execution**: Python & JavaScript code sandbox runner evaluating test cases
- **WebSockets**: Socket.IO for room cursor sync, WebRTC video signaling, and broadcast toasts

---

## 🚀 Quick Start & Setup Instructions

### **1. Install Dependencies**
```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### **2. Setup Database & Seed Data**
```bash
cd ../server
npm run prisma:push
npm run seed
npm run migrate:auth   # one-time; safe to re-run. Add --dry-run to preview.
```

`migrate:auth` brings pre-existing accounts onto the current auth schema: it rewrites the
legacy `CANDIDATE` role to `USER`, grandfathers older accounts as email-verified so they are
not locked out, and re-applies the `ADMIN_EMAILS` allow-list. It never invents passwords —
accounts created before password auth sign in with a provider (Google / GitHub) or use
**Forgot password** to set one for the first time.

### **3. Start Development Servers**

**Terminal 1 (Backend Server - Port 5000):**
```bash
cd server
npm run dev
```

**Terminal 2 (Frontend Client - Port 3000):**
```bash
cd client
npm run dev
```

Open your browser at `http://localhost:3000`.

---

## 🔐 Authentication & Authorization

Three sign-in methods, all ending in the same server-issued session:

- **Email + password** — bcrypt at 12 rounds, verified email required before first sign-in.
- **Google OAuth 2.0** — the ID token is verified server-side against Google's published RSA
  keys (signature, issuer, audience, expiry and `email_verified`). Nothing the client says
  about the user is trusted. Set `GOOGLE_CLIENT_ID` (+ `GOOGLE_CLIENT_SECRET` for the
  authorization-code flow) in `.env`; see `.env.example` for the console setup.
- **GitHub OAuth 2.0** — authorization-code flow only. GitHub is not an OpenID Connect
  provider, so there is no ID token and no browser-side SDK: the server exchanges the code
  and reads the profile from the GitHub API itself, and the browser never handles a GitHub
  token. Set `GITHUB_CLIENT_ID` **and** `GITHUB_CLIENT_SECRET` in `server/.env`.

**Account linking.** Signing in with a provider whose email matches an existing account
attaches the identity to that account rather than creating a duplicate. That is safe only
because a provider email is accepted **only when the provider reports it as verified** —
`email_verified` for Google, and a `verified: true` entry from GitHub's `/user/emails`. An
unverified address is never trusted, in either direction: without that rule anyone could put
someone else's address on a throwaway provider account and inherit their NextHire account.
GitHub's `/user`.email field is deliberately ignored, because it carries no verification
status. Both providers run through one `upsertOAuthUser` in `authController.js`, so the
linking rules cannot drift apart between them.

Unlinking a provider is refused when it is the account's last remaining sign-in method — with
two providers plus passwords, "can they still get in?" is no longer the same question as "do
they have a password?".

**Sessions.** A short-lived access-token JWT (15m) is held in memory only — never in
`localStorage`, so an XSS bug cannot walk away with a durable credential. The refresh token
lives in an HTTP-only, SameSite cookie, is stored server-side only as a sha256 hash, and
**rotates on every use**. Presenting an already-rotated token is treated as theft and revokes
every session for that account. A page reload restores the session by calling
`POST /auth/refresh` once at startup.

Access is revocable in real time: every authenticated request re-checks that the account is
still active and that the token's `tokenVersion` and session are still valid, so logout,
"sign out everywhere", a password change, an account disable, or a role change all take
effect immediately rather than when the access token happens to expire.

**Roles.** `ADMIN` is granted solely by the `ADMIN_EMAILS` allow-list — it cannot be set from
a request body or handed out through the admin API. Everyone else is `USER`; `INTERVIEWER`
exists and is assignable, wired into the permission matrix but not yet given extra screens.
Routes declare the *capability* they need (`question:manage`, `user:manage`, …) rather than a
role; the matrix lives in `server/src/shared/authz.js` and the client receives its resolved
permission list from `/auth/me`, so the two ends cannot drift.

Also included: rate limiting plus per-account lockout, CSRF protection (double-submit) on the
cookie-authenticated endpoints, single-use expiring email-verification and password-reset
tokens, an enumeration-proof forgot-password flow, a per-account security timeline, a
signed-in-devices list, and admin user management (search, enable/disable, change role, force
reset, clear lockout, revoke sessions, login history).

Sign-in pages: `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`.
Account settings live at `/profile`; admin user management at `/admin/users`.

### **Local development accounts**

There are no shared demo passwords. Create an account at `/register` — with
`MAIL_PROVIDER=console` the verification link is printed to the server console (and offered
directly in the UI in development). To get an admin, register with an address listed in
`ADMIN_EMAILS`, or add your own address to that list and sign in again.

---

## 📡 REST API Documentation

### **Authentication**
- `GET /api/v1/auth/config` - Sign-in page capabilities (which providers are enabled, password policy)
- `POST /api/v1/auth/register` - Create an account and send a verification email
- `POST /api/v1/auth/verify-email` - Consume a single-use verification token
- `POST /api/v1/auth/resend-verification` - Reissue a verification link
- `POST /api/v1/auth/login` - Email + password sign-in; sets the refresh cookie
- `POST /api/v1/auth/google` - Google Identity Services credential (ID token) sign-in
- `GET /api/v1/auth/google/start` → `GET /api/v1/auth/google/callback` - Authorization-code flow
- `GET /api/v1/auth/github/start` → `GET /api/v1/auth/github/callback` - GitHub authorization-code flow
- `POST /api/v1/auth/refresh` - Rotate the refresh token, mint a new access token (CSRF)
- `POST /api/v1/auth/logout` / `POST /api/v1/auth/logout-all` - End this device / every device
- `GET /api/v1/auth/me` - The caller, with their resolved permission list
- `POST /api/v1/auth/forgot-password` / `POST /api/v1/auth/reset-password` - Password reset
- `POST /api/v1/auth/change-password` - Change (or first set) a password
- `PATCH /api/v1/auth/profile` - Update own name / mobile / avatar / links
- `GET /api/v1/auth/sessions` / `DELETE /api/v1/auth/sessions/:id` - Signed-in devices
- `GET /api/v1/auth/security-events` - Own security timeline
- `POST /api/v1/auth/google/unlink` - Unlink Google (refused if it would lock you out)
- `POST /api/v1/auth/github/unlink` - Unlink GitHub (refused if it would lock you out)
- `GET /api/v1/auth/admin/users` - Admin: search users *(requires `user:manage`)*
- `PATCH /api/v1/auth/admin/users/:id/status` - Admin: enable / disable an account
- `PATCH /api/v1/auth/admin/users/:id/role` - Admin: change role
- `POST /api/v1/auth/admin/users/:id/reset-password` - Admin: email the user a reset link
- `POST /api/v1/auth/admin/users/:id/unlock` - Admin: clear a brute-force lockout
- `POST /api/v1/auth/admin/users/:id/revoke-sessions` - Admin: sign a user out everywhere
- `GET /api/v1/auth/admin/users/:id/login-history` - Admin: authentication history
- `GET /api/v1/auth/admin/analytics` - Admin: account and auth metrics *(`analytics:read`)*

### **Questions & Code Execution**
- `GET /api/questions` - Search & filter question bank by difficulty/category
- `GET /api/questions/:id` - Fetch single question details and starter code
- `POST /api/questions` - `[ADMIN]` Create a new coding question
- `PUT /api/questions/:id` - `[ADMIN]` Update an existing coding question
- `DELETE /api/questions/:id` - `[ADMIN]` Delete a question
- `POST /api/questions/:id/execute` - Execute code against test cases in sandbox

### **Contests**
- `GET /api/contests` - Fetch active, upcoming, and past speed contests
- `GET /api/contests/:id` - Fetch contest leaderboard & submission history
- `POST /api/contests` - `[ADMIN]` Create and launch a new contest

### **Interviews**
- `GET /api/interviews` - Fetch scheduled technical mock interviews
- `GET /api/interviews/:id` - Fetch interview room session details
- `POST /api/interviews` - `[ADMIN]` Schedule an interview session
- `POST /api/interviews/:id/report` - Generate post-interview performance report

### **User Profile & Notifications**
- `GET /api/users/profile` - Fetch candidate profile, stats, and bio
- `PUT /api/users/profile` - Update bio, social links, and skills
- `GET /api/notifications` - Fetch real-time user notifications
- `POST /api/notifications/broadcast` - `[ADMIN]` Send global notification toast

---

## 🗄️ Database Schema Summary (Prisma)

- **User**: Authentication, role (`ADMIN` / `CANDIDATE`), bcrypt password hash.
- **Profile**: Bio, rank, streak, GitHub/LinkedIn links, skills portfolio.
- **Question**: Title, slug, difficulty (`EASY`, `MEDIUM`, `HARD`), starter code JSON, test cases JSON.
- **Contest**: Title, description, schedule, status (`UPCOMING`, `LIVE`, `ENDED`), problem list.
- **Interview**: Room code, candidate, interviewer, position, status, report.
- **Submission**: Code, language, test pass count, execution runtime, memory used.
- **Notification**: Real-time user alert messages.
- **InterviewReport**: Overall score, rubric breakdown (Problem Solving, Code Quality, Communication), feedback.

---

## 🐳 Docker Configuration (Optional)

To launch PostgreSQL via Docker:
```bash
docker-compose up -d
```
Then update `server/.env` with `DATABASE_URL="postgresql://nexthire:nexthire_password@localhost:5432/nexthire_db?schema=public"`.
# nexthire


The app is still in progress