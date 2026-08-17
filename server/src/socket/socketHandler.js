const { resolveAccessToken } = require('../features/auth/authMiddleware');

/**
 * Socket.IO exists for exactly one thing: pushing a submission's judge verdict to the user
 * who made it, so the IDE updates the moment the verdict lands instead of waiting for the
 * next poll. Everything is delivered to the private `user:<id>` room.
 *
 * It used to also carry a room-based live-collaboration surface (join-room / code-change /
 * send-message / video-signal) for an interview feature that was never built. Nothing in the
 * client ever passed a room code, and the handlers had no room-membership check at all — any
 * authenticated user could join any room by guessing its code and receive whatever was
 * broadcast into it. Dead code with a live blast radius; removed.
 *
 * The client also falls back to polling `/submissions/:id/result`, so the app stays correct
 * (just less immediate) if the socket cannot connect at all.
 */
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
      socket.user = { id: result.user.id, name: result.user.name };
      return next();
    } catch (err) {
      console.error('[Socket.IO] auth error:', err.message);
      return next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    // Auto-join the user's private room so judge verdicts (emitted here in inline mode, or
    // relayed from the worker process over Redis in queue mode) reach only this user.
    if (socket.user?.id) {
      socket.join(`user:${socket.user.id}`);
    }
  });
}

module.exports = { initSockets };
