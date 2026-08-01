const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./features/auth/authRoutes');
const questionRoutes = require('./features/question-bank/questionRoutes');
const contestRoutes = require('./features/contest/contestRoutes');
const submissionRoutes = require('./features/submission/submissionRoutes');
const libraryRoutes = require('./features/library/libraryRoutes');
const { serveDocs } = require('./shared/docs/swagger');
const { initSockets } = require('./socket/socketHandler');
const { initJudgeEventRelay } = require('./features/judge/judgeEvents');
const { reconcilePendingSubmissions } = require('./features/judge/reconcile');
const { isInlineMode, setJudgeIo } = require('./features/judge/judgeDispatch');
const { updateContestStatuses } = require('./features/contest/contestController');
const { prisma } = require('./shared/db');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']
  }
});

// Middleware
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// WebSockets
initSockets(io);

if (isInlineMode()) {
  // Inline judge (JUDGE_INLINE=1): submissions are evaluated in this process, so there is no
  // separate worker and no Redis relay. Emit lifecycle events straight to Socket.IO instead.
  setJudgeIo(io);
  console.log('🧑‍⚖️  [judge] inline mode — submissions evaluated in-process (no Redis/worker).');
} else {
  // Relay judge verdicts published by the (separate) worker process to the submitter's room.
  // Non-fatal if Redis is unavailable — the frontend falls back to polling.
  try {
    initJudgeEventRelay(io);
  } catch (err) {
    console.error('[judge] event relay init failed:', err.message);
  }
}

// Safety net: re-enqueue any submissions left PENDING (e.g. enqueued just before a crash).
reconcilePendingSubmissions().catch((err) => console.error('[judge] reconcile failed:', err.message));

// Contest lifecycle: flip UPCOMING→LIVE→ENDED on schedule so a contest ends automatically
// when its timer expires, even if nobody is reading it. Reads still reconcile lazily too.
const CONTEST_SWEEP_MS = Number(process.env.CONTEST_SWEEP_MS) || 30000;
updateContestStatuses().catch((err) => console.error('[contest] status sweep failed:', err.message));
const contestSweep = setInterval(() => {
  updateContestStatuses().catch((err) => console.error('[contest] status sweep failed:', err.message));
}, CONTEST_SWEEP_MS);
if (contestSweep.unref) contestSweep.unref();

// Health Check & OpenAPI Docs
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'NextHire Production REST API (v1)', timestamp: new Date().toISOString() });
});
if (process.env.NODE_ENV !== 'production') {
  app.get('/docs', serveDocs);
}

// Versioned API Routes (/api/v1/)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/questions', questionRoutes);
app.use('/api/v1/contests', contestRoutes);
app.use('/api/v1/submissions', submissionRoutes);
app.use('/api/v1/library', libraryRoutes);

// Backward-compatible aliases
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/library', libraryRoutes);

// Global Error Handler
// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by its 4-arg signature.
app.use((err, req, res, _next) => {
  console.error('[Express Error]', err);
  res.status(500).json({ success: false, error: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`================================================`);
  console.log(`🚀 NextHire v1 Server listening on port ${PORT}`);
  console.log(`👉 Health Check: http://localhost:${PORT}/api/health`);
  console.log(`👉 OpenAPI Specs: http://localhost:${PORT}/docs`);
  console.log(`================================================`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    prisma.$disconnect();
    process.exit(0);
  });
});
