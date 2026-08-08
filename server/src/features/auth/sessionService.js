const { prisma } = require('../../shared/db');
const { authConfig } = require('./authConfig');
const { createRefreshToken, hashToken } = require('./tokenService');
const { track } = require('./auditService');

/**
 * Session lifecycle: one `Session` row per signed-in device.
 *
 * Design notes
 * ------------
 * • Only sha256(refreshToken) is stored. A database dump cannot be replayed as a login.
 * • Every refresh *rotates* the token: the row's hash is replaced and the old hash is
 *   kept in `previousTokenHash`. Presenting a previously-rotated token means the token
 *   was captured and replayed, so the whole user's sessions are revoked (`reuse`).
 * • A session dies on whichever comes first: absolute expiry (`expiresAt`) or idle
 *   timeout (`lastUsedAt` + idle window). "Remember me" sessions use their full TTL as
 *   the idle window, so they only die at absolute expiry.
 */

/**
 * Idle window for a session, in ms. "Remember me" sessions opt out of the idle timeout by
 * using their full refresh TTL, so absolute expiry is the only thing that ends them.
 */
function idleWindowMs(session) {
  const sec = session.rememberMe
    ? authConfig.refreshTokenRememberTtlSec
    : authConfig.sessionIdleTimeoutSec;
  return sec * 1000;
}

function isExpired(session, now = new Date()) {
  if (session.revokedAt) return true;
  if (session.expiresAt.getTime() <= now.getTime()) return true;
  return session.lastUsedAt.getTime() + idleWindowMs(session) <= now.getTime();
}

/**
 * Start a new session and return the raw refresh token (the only time it exists outside
 * the client's cookie).
 */
async function createSession({ userId, provider = 'PASSWORD', rememberMe = false, context = {} }) {
  const refresh = createRefreshToken({ rememberMe });

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: refresh.tokenHash,
      provider,
      rememberMe,
      expiresAt: refresh.expiresAt,
      lastUsedAt: new Date(),
      userAgent: context.userAgent || null,
      browser: context.browser || null,
      os: context.os || null,
      device: context.device || null,
      ipAddress: context.ipAddress || null,
    },
  });

  await enforceSessionLimit(userId, session.id);

  return { session, refreshToken: refresh.token, ttlSec: refresh.ttlSec };
}

/**
 * Keep at most `maxSessionsPerUser` live sessions; revoke the least recently used beyond
 * that. Prevents an unbounded session table from a scripted login loop.
 */
async function enforceSessionLimit(userId, keepSessionId) {
  const live = await prisma.session.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastUsedAt: 'desc' },
    select: { id: true },
  });

  const excess = live.filter((s) => s.id !== keepSessionId).slice(authConfig.maxSessionsPerUser - 1);
  if (!excess.length) return;

  await prisma.session.updateMany({
    where: { id: { in: excess.map((s) => s.id) } },
    data: { revokedAt: new Date(), revokedReason: 'session_limit' },
  });
}

/**
 * Exchange a refresh token for a fresh one (rotation).
 *
 * @returns {Promise<
 *   | { ok: true, session: object, refreshToken: string, ttlSec: number }
 *   | { ok: false, reason: 'not_found'|'expired'|'reuse' }
 * >}
 */
async function rotateSession(rawToken, context = {}) {
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  const session = await prisma.session.findUnique({ where: { tokenHash } });

  if (!session) {
    // Not the current token — is it one we already rotated away? That is a replay.
    const replayed = await prisma.session.findUnique({ where: { previousTokenHash: tokenHash } });
    if (replayed) {
      await revokeAllSessions(replayed.userId, 'token_reuse_detected');
      track({
        type: 'TOKEN_REUSE_DETECTED',
        userId: replayed.userId,
        detail: 'rotated refresh token presented again — all sessions revoked',
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      return { ok: false, reason: 'reuse' };
    }
    return { ok: false, reason: 'not_found' };
  }

  if (isExpired(session, now)) {
    if (!session.revokedAt) {
      await prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: now, revokedReason: 'expired' },
      });
    }
    return { ok: false, reason: 'expired' };
  }

  const next = createRefreshToken({ rememberMe: session.rememberMe });

  // Absolute expiry does not slide on refresh — a session cannot be kept alive forever
  // by refreshing; it must be re-established by a real login once expiresAt passes.
  const updated = await prisma.session.update({
    where: { id: session.id },
    data: {
      tokenHash: next.tokenHash,
      previousTokenHash: session.tokenHash,
      lastUsedAt: now,
      ipAddress: context.ipAddress || session.ipAddress,
      userAgent: context.userAgent || session.userAgent,
      browser: context.browser || session.browser,
      os: context.os || session.os,
      device: context.device || session.device,
    },
  });

  return {
    ok: true,
    session: updated,
    refreshToken: next.token,
    ttlSec: Math.max(1, Math.floor((updated.expiresAt.getTime() - now.getTime()) / 1000)),
  };
}

/** Revoke the single session identified by a raw refresh token (normal logout). */
async function revokeByToken(rawToken, reason = 'logout') {
  const tokenHash = hashToken(rawToken);
  const result = await prisma.session.updateMany({
    where: { OR: [{ tokenHash }, { previousTokenHash: tokenHash }], revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count > 0;
}

async function revokeSessionById(sessionId, userId, reason = 'revoked_by_user') {
  const result = await prisma.session.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count > 0;
}

/**
 * Revoke every session for a user. Callers that want existing *access* tokens killed too
 * must also bump `user.tokenVersion` — see `revokeEverything`.
 */
async function revokeAllSessions(userId, reason = 'logout_all', { exceptSessionId } = {}) {
  const result = await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.count;
}

/**
 * Full invalidation: kill refresh sessions *and* invalidate outstanding access tokens by
 * bumping tokenVersion. Used by logout-all, password change/reset, disable, role change.
 */
async function revokeEverything(userId, reason, { exceptSessionId } = {}) {
  const count = await revokeAllSessions(userId, reason, { exceptSessionId });
  await prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
  return count;
}

/** Live sessions for the Profile "signed-in devices" list. Never exposes token hashes. */
async function listSessions(userId, { currentSessionId } = {}) {
  const now = new Date();
  const sessions = await prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { lastUsedAt: 'desc' },
    select: {
      id: true,
      provider: true,
      rememberMe: true,
      browser: true,
      os: true,
      device: true,
      ipAddress: true,
      lastUsedAt: true,
      createdAt: true,
      expiresAt: true,
    },
  });

  return sessions
    .filter((s) => !isExpired({ ...s, revokedAt: null }, now))
    .map((s) => ({ ...s, isCurrent: s.id === currentSessionId }));
}

/**
 * Housekeeping: drop long-dead rows so the table does not grow without bound.
 * Called on a timer from server startup.
 */
async function pruneExpiredSessions({ olderThanDays = 30 } = {}) {
  const cutoff = new Date(Date.now() - olderThanDays * 86400_000);
  const { count } = await prisma.session.deleteMany({
    where: {
      OR: [{ expiresAt: { lt: cutoff } }, { revokedAt: { lt: cutoff } }],
    },
  });
  return count;
}

module.exports = {
  createSession,
  rotateSession,
  revokeByToken,
  revokeSessionById,
  revokeAllSessions,
  revokeEverything,
  listSessions,
  pruneExpiredSessions,
  isExpired,
};
