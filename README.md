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
```

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

## 🔑 Demo Credentials

| Role | Email | Password | Permissions |
|---|---|---|---|
| **Candidate Persona** | `alex@nexthire.dev` | `AlexPass123!` | Candidate Dashboard, Live Practice, Contests, Waiting Room |
| **Admin Persona** | `admin@nexthire.dev` | `AdminPass123!` | Admin Question Bank CRUD, Contest Creator, Broadcast Messages |

---

## 📡 REST API Documentation

### **Authentication**
- `POST /api/auth/register` - Register a new candidate or admin account
- `POST /api/auth/login` - Authenticate & receive JWT access + refresh tokens
- `GET /api/auth/me` - Fetch authenticated user profile and session details

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