const { resolveAccessToken } = require('../features/auth/authMiddleware');
const { normalizeRole } = require('../shared/authz');

function initSockets(io) {
  // Socket authentication. Uses the same resolver as the REST middleware, so a disabled
  // account, a revoked session, or a bumped tokenVersion is rejected at the handshake —
  // signing out must close the websocket too, not just the HTTP path.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const result = await resolveAccessToken(token);
      if (!result.ok) {
        const error = new Error(result.error);
        // Surfaced to the client as `err.data`, so it can refresh and reconnect rather
        // than treating every handshake failure as fatal.
        error.data = { code: result.code };
        return next(error);
      }
      socket.user = {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: normalizeRole(result.user.role),
        sessionId: result.payload.sid || null,
      };
      return next();
    } catch (err) {
      console.error('[Socket.IO] auth error:', err.message);
      return next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id} (User: ${socket.user?.name || 'unknown'})`);

    // Auto-join the user's private room so the judge worker can push submission verdicts
    // (relayed from the worker process over Redis) to exactly this user's clients.
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
    }

    // Join room (e.g. NH-LIVE-8821 or contest ID)
    socket.on('join-room', ({ roomCode, userName }) => {
      try {
        socket.join(roomCode);
        console.log(`[Socket.IO] ${userName || socket.user?.name} (${socket.id}) joined room: ${roomCode}`);
        socket.to(roomCode).emit('user-joined', { socketId: socket.id, userName: userName || socket.user?.name });
      } catch (err) {
        console.error('[Socket.IO] Error in join-room:', err);
      }
    });

    // Real-time Code Synchronization
    socket.on('code-change', ({ roomCode, code, language }) => {
      try {
        socket.to(roomCode).emit('code-update', { code, language });
      } catch (err) {
        console.error('[Socket.IO] Error in code-change:', err);
      }
    });

    // Real-time Chat Messages
    socket.on('send-message', ({ roomCode, message, senderName, timestamp }) => {
      try {
        io.in(roomCode).emit('receive-message', {
          id: `msg-${Date.now()}`,
          message,
          senderName: senderName || socket.user?.name,
          timestamp: timestamp || new Date().toISOString()
        });
      } catch (err) {
        console.error('[Socket.IO] Error in send-message:', err);
      }
    });

    // WebRTC Video Signaling
    socket.on('video-signal', ({ roomCode, signal }) => {
      try {
        socket.to(roomCode).emit('video-signal', { socketId: socket.id, signal });
      } catch (err) {
        console.error('[Socket.IO] Error in video-signal:', err);
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id} (User: ${socket.user?.name || 'unknown'})`);
    });
  });
}

module.exports = { initSockets };
