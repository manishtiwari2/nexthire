const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { Server } = require('socket.io');
require('dotenv').config();

const authRoutes = require('./features/auth/authRoutes');
const questionRoutes = require('./features/question-bank/questionRoutes');
const contestRoutes = require('./features/contest/contestRoutes');
const interviewRoutes = require('./features/interview/interviewRoutes');
const dashboardRoutes = require('./features/dashboard/dashboardRoutes');
const revisionRoutes = require('./features/revision/revisionRoutes');
const profileRoutes = require('./features/profile/profileRoutes');
const { serveDocs } = require('./shared/docs/swagger');
const { initSockets } = require('./socket/socketHandler');
const { prisma } = require('./shared/db');
const notificationRoutes = require('./features/notification/notificationRoutes');

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
app.use('/api/v1/interviews', interviewRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/revision', revisionRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/users/profile', profileRoutes);  // Client calls /users/profile

// Fallback v1 endpoint aliases for client backward compatibility
app.use('/api/auth', authRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/contests', contestRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/users/profile', profileRoutes);
app.use('/api/notifications', notificationRoutes);

// Global Error Handler
app.use((err, req, res, next) => {
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
