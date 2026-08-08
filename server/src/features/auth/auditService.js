const { prisma } = require('../../shared/db');

/**
 * Security timeline writer.
 *
 * Auditing must never break the request it is describing: a failed insert is logged and
 * swallowed. Callers therefore do not need to await or guard these calls.
 */

/**
 * @param {{
 *   type: string,
 *   userId?: string|null,
 *   email?: string|null,
 *   provider?: 'PASSWORD'|'GOOGLE'|null,
 *   detail?: string|null,
 *   ipAddress?: string|null,
 *   userAgent?: string|null,
 * }} event
 */
async function recordAuthEvent(event) {
  try {
    await prisma.authEvent.create({
      data: {
        type: event.type,
        userId: event.userId || null,
        email: event.email ? String(event.email).toLowerCase() : null,
        provider: event.provider || null,
        detail: event.detail ? String(event.detail).slice(0, 240) : null,
        ipAddress: event.ipAddress || null,
        userAgent: event.userAgent ? String(event.userAgent).slice(0, 512) : null,
      },
    });
  } catch (err) {
    console.error('[auth] failed to record auth event:', err.message);
  }
}

/** Fire-and-forget wrapper for hot paths where awaiting the write adds no value. */
function track(event) {
  void recordAuthEvent(event);
}

/** Recent events for one user — powers the Profile security timeline and Admin drill-down. */
async function listUserEvents(userId, { take = 25 } = {}) {
  return prisma.authEvent.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(Number(take) || 25, 1), 200),
    select: {
      id: true,
      type: true,
      provider: true,
      detail: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
    },
  });
}

module.exports = { recordAuthEvent, track, listUserEvents };
