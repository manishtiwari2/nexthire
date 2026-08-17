const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');
require('dotenv').config();

const { assertProductionConfig, authConfig } = require('./features/auth/authConfig');
const { pruneExpiredSessions } = require('./features/auth/sessionService');

// Refuse to boot a production process with dev secrets, insecure cookies, or a mail
// provider that silently drops verification emails. Better a crash than a quiet downgrade.
assertProductionConfig();

const authRoutes = require('./features/auth/authRoutes');
const questionRoutes = require('./features/question-bank/questionRoutes');
const contestRoutes = require('./features/contest/contestRoutes');
const submissionRoutes = require('./features/submission/submissionRoutes');
const libraryRoutes = require('./features/library/libraryRoutes');
const revisionRoutes = require('./features/revision/revisionRoutes');
const { serveDocs } = require('./shared/docs/swagger');
const { initSockets } = require('./socket/socketHandler');
const { initJudgeEventRelay } = require('./features/judge/judgeEvents');
const { reconcilePendingSubmissions } = require('./features/judge/reconcile');
const { isInlineMode, setJudgeIo } = require('./features/judge/judgeDispatch');
const { updateContestStatuses } = require('./features/contest/contestController');
const { prisma } = require('./shared/db');

const app = express();
const server = http.createServer(app);

// Socket.IO shares the HTTP allow-list rather than keeping its own. It previously fell back
// to a hard-coded localhost:5173, so a deployment that set CLIENT_URL but relied on
// CORS_ORIGINS for its real front-end silently lost live verdict updates (and fell back to
// polling) with no error anywhere.
const io = new Server(server, {
  cors: {
    origin: authConfig.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// Middleware
// `credentials: true` + an explicit origin (never `*`) is required for the HTTP-only
// refresh cookie to be sent and accepted cross-origin.
app.use(
  cors({
    // An explicit allow-list, never `*` — the spec forbids a wildcard origin on
    // credentialed requests, so a wildcard would silently break the refresh cookie.
    origin(origin, callback) {
      // No Origin header: same-origin navigation, curl, or a server-to-server call.
      if (!origin) return callback(null, true);
      if (authConfig.allowedOrigins.includes(origin.replace(/\/$/, ''))) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    exposedHeaders: ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// `X-Forwarded-For` is only believed when TRUST_PROXY says we are behind one; otherwise a
// client could spoof its IP and poison rate-limit buckets and audit records.
if (process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// Baseline security headers. Deliberately hand-rolled rather than pulling in helmet: this
// is a JSON API plus a static SPA bundle, so only a handful of headers actually apply.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  // Auth responses must never be cached by a proxy or the browser's back/forward cache.
  if (req.path.startsWith('/api/v1/auth') || req.path.startsWith('/api/auth')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
  }
  if (authConfig.isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

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

// Session housekeeping: drop rows for sessions that expired or were revoked long ago so
// the table does not grow without bound. Purely cosmetic for correctness — expiry is
// always enforced at read time.
const SESSION_PRUNE_MS = Number(process.env.SESSION_PRUNE_MS) || 6 * 60 * 60 * 1000;
const runPrune = () =>
  pruneExpiredSessions()
    .then((count) => {
      if (count) console.log(`🧹 [auth] pruned ${count} stale session row(s).`);
    })
    .catch((err) => console.error('[auth] session prune failed:', err.message));
runPrune();
const sessionPrune = setInterval(runPrune, SESSION_PRUNE_MS);
if (sessionPrune.unref) sessionPrune.unref();

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
app.use('/api/v1/revision', revisionRoutes);

// Backward-compatible aliases
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/revision', revisionRoutes);

// 404 for unmatched API routes — otherwise a typo'd path falls through to the error
// handler and reports a confusing 500.
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, error: `No route for ${req.method} ${req.originalUrl}`, code: 'NOT_FOUND' });
});

// Global Error Handler
// eslint-disable-next-line no-unused-vars -- Express identifies error middleware by its 4-arg signature.
app.use((err, req, res, _next) => {
  console.error('[Express Error]', err);
  // Internal messages can carry table names, query fragments and file paths. Log them,
  // but never ship them to a client in production.
  res.status(err.status || 500).json({
    success: false,
    error: authConfig.isProduction
      ? 'Something went wrong. Please try again.'
      : err.message || 'Internal Server Error',
    code: err.code || 'INTERNAL_ERROR',
  });
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
