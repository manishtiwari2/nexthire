/**
 * Fixed-window rate limiting, in process memory.
 *
 * Deliberately dependency-free and node-local. The judge already treats Redis as
 * optional, so auth must not become the thing that requires it. For a single-instance
 * deploy this is a real control; behind multiple instances each replica enforces its own
 * window, so set limits accordingly (or front the API with a gateway limiter).
 *
 * Applied *in addition to* the per-account lockout in the login flow — this stops volume,
 * the lockout stops targeted guessing.
 */

/** @type {Map<string, {count: number, resetAt: number}>} */
const buckets = new Map();

const SWEEP_INTERVAL_MS = 60_000;
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, SWEEP_INTERVAL_MS);
// Never keep the process alive for housekeeping.
if (sweep.unref) sweep.unref();

/**
 * Record a hit and report whether it is allowed.
 * @returns {{allowed: boolean, remaining: number, retryAfterSec: number, limit: number}}
 */
function consume(key, { limit, windowSec }) {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { allowed: true, remaining: limit - 1, retryAfterSec: windowSec, limit };
  }

  existing.count += 1;
  const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return {
    allowed: existing.count <= limit,
    remaining: Math.max(0, limit - existing.count),
    retryAfterSec,
    limit,
  };
}

/** Drop a bucket — used after a *successful* login so one bad typo isn't punished. */
function reset(key) {
  buckets.delete(key);
}

/**
 * Build an Express middleware.
 *
 * @param {object} options
 * @param {string} options.name         bucket namespace, keeps limiters independent
 * @param {number} options.limit        allowed requests per window
 * @param {number} options.windowSec    window length in seconds
 * @param {(req: import('express').Request) => string} [options.keyGenerator]
 * @param {string} [options.message]
 */
function rateLimit({ name, limit, windowSec, keyGenerator, message }) {
  const buildKey =
    keyGenerator || ((req) => req.ip || req.socket?.remoteAddress || 'unknown');

  return function rateLimitMiddleware(req, res, next) {
    // Never rate-limit the test suite's own traffic; it would make tests order-dependent.
    if (process.env.DISABLE_RATE_LIMIT === '1') return next();

    const key = `${name}:${buildKey(req)}`;
    const result = consume(key, { limit, windowSec });

    res.setHeader('X-RateLimit-Limit', String(result.limit));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));

    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfterSec));
      return res.status(429).json({
        success: false,
        error: message || 'Too many requests. Please try again shortly.',
        code: 'RATE_LIMITED',
        retryAfterSec: result.retryAfterSec,
      });
    }

    // Let handlers clear the bucket on success (see the login flow).
    req.rateLimitKey = key;
    return next();
  };
}

/** Clear every bucket. Test helper. */
function resetAll() {
  buckets.clear();
}

module.exports = { rateLimit, consume, reset, resetAll };
