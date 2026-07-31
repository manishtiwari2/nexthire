// Shared configuration + Redis connection factory for the judge queue and the
// cross-process event relay. Kept tiny and dependency-light so it can be required
// from the API process, the worker process, and unit tests alike.

const JUDGE_QUEUE_NAME = 'nexthire-judge';

// Redis pub/sub channel the worker publishes lifecycle events on; the API subscribes
// and re-emits them to the owning user's Socket.IO room.
const JUDGE_EVENTS_CHANNEL = 'judge:events';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

/**
 * Create an ioredis connection suitable for BullMQ.
 *
 * BullMQ requires `maxRetriesPerRequest: null` and `enableReadyCheck: false` on the
 * connections used by its blocking commands. `lazyConnect` keeps the TCP socket closed
 * until the first command, so simply requiring this module (e.g. when a controller is
 * imported in a unit test) never dials Redis.
 *
 * @param {object} [overrides] extra ioredis options
 * @returns {import('ioredis').Redis}
 */
function createRedisConnection(overrides = {}) {
  // Lazily require ioredis so tests that mock the queue never load the driver.
  const IORedis = require('ioredis');
  return new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    ...overrides
  });
}

module.exports = {
  JUDGE_QUEUE_NAME,
  JUDGE_EVENTS_CHANNEL,
  REDIS_URL,
  createRedisConnection
};
