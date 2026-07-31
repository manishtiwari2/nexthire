// Cross-process judge events.
//
// The worker runs in a separate process from the API/Socket.IO server, so it cannot emit
// to sockets directly. Instead it PUBLISHES lifecycle events to a Redis channel; the API
// process SUBSCRIBES and re-emits them to the owning user's Socket.IO room. This keeps the
// API as the only Socket.IO server and scales to many worker processes.

const { JUDGE_EVENTS_CHANNEL, createRedisConnection } = require('./queueConfig');

/**
 * Build the event payload (pure — unit-tested). `phase` is 'RUNNING' while judging and
 * 'COMPLETED' when a verdict is final.
 * @param {{submissionId:string, userId:string, phase:string, status?:string, result?:object}} input
 */
function buildEventPayload({ submissionId, userId, phase, status, result }) {
  return {
    submissionId,
    userId,
    phase,
    status: status || (result && result.status) || null,
    // Only lightweight, non-sensitive fields go over the wire; full per-test detail (which
    // may include hidden cases) is fetched via the authorized REST DTO, never broadcast.
    result: result
      ? {
          status: result.status,
          passedTests: result.passedTests,
          totalTests: result.totalTests,
          executionTime: result.executionTime,
          memoryUsed: result.memoryUsed,
          compilerOutput: result.compilerOutput || '',
          stderr: result.stderr || ''
        }
      : null
  };
}

/** Create a publisher bound to its own Redis connection. Returns { publish, close }. */
function createPublisher() {
  const conn = createRedisConnection();
  return {
    async publish(payload) {
      await conn.publish(JUDGE_EVENTS_CHANNEL, JSON.stringify(payload));
    },
    async close() {
      await conn.quit();
    }
  };
}

/**
 * Subscribe on the API side and relay events to Socket.IO rooms. Each event is emitted to
 * `user:<userId>` so only the submitter's connected clients receive it.
 * @param {import('socket.io').Server} io
 * @returns {import('ioredis').Redis} the subscriber (call .quit() to stop)
 */
function initJudgeEventRelay(io) {
  const sub = createRedisConnection();
  sub.subscribe(JUDGE_EVENTS_CHANNEL).catch((err) => {
    console.error('[judge] failed to subscribe to event channel:', err.message);
  });
  sub.on('message', (channel, message) => {
    if (channel !== JUDGE_EVENTS_CHANNEL) return;
    try {
      const payload = JSON.parse(message);
      if (payload.userId) {
        io.to(`user:${payload.userId}`).emit('submission:update', payload);
      }
    } catch (err) {
      console.error('[judge] bad event payload:', err.message);
    }
  });
  return sub;
}

module.exports = { buildEventPayload, createPublisher, initJudgeEventRelay };
