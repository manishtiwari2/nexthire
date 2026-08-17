const { prisma } = require('../../shared/db');
const { authConfig } = require('./authConfig');
const { ROLES, normalizeRole } = require('../../shared/authz');
const { toAdminUserDto } = require('./userDto');
const { createEmailToken } = require('./tokenService');
const sessionService = require('./sessionService');
const { describeRequest } = require('./requestContext');
const { track, listUserEvents } = require('./auditService');
const mailer = require('./mailService');

/**
 * Admin user management. Every route here sits behind `requirePermission('user:manage')`.
 *
 * Two guard rails run through the whole file:
 *  • An admin cannot act destructively on their own account (disable themselves, drop
 *    their own role) — that is how an org locks itself out of its own admin panel.
 *  • An admin whose email is in ADMIN_EMAILS cannot be demoted here, because the login
 *    flow would restore ADMIN on their next sign-in. The list is the source of truth, so
 *    the API says so plainly instead of pretending the change stuck.
 */

const IS_DEV = process.env.NODE_ENV !== 'production';

function fail(res, status, code, error, extra = {}) {
  return res.status(status).json({ success: false, error, code, ...extra });
}
function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function isConfiguredAdmin(email) {
  return authConfig.adminEmails.includes(String(email || '').toLowerCase());
}

/**
 * GET /admin/users
 *
 * Paginated search over name / email / mobile with role and status filters.
 * `activeSessionCount` comes from a relation count so the list can show who is signed in.
 */
async function listUsers(req, res, next) {
  try {
    const { q, role, status, page, pageSize } = req.validatedQuery;

    const where = {};

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { mobile: { contains: q } },
      ];
    }

    if (role) {
      // A search for USER should also surface legacy CANDIDATE rows.
      where.role = role === ROLES.USER ? { in: [ROLES.USER, ROLES.CANDIDATE] } : role;
    }

    if (status === 'active') where.isActive = true;
    else if (status === 'disabled') where.isActive = false;
    else if (status === 'unverified') where.emailVerified = false;

    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } },
        },
      }),
    ]);

    return ok(res, {
      users: users.map(toAdminUserDto),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /admin/users/:id — one user with their live sessions and recent security events. */
async function getUser(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: { profile: { include: { userSkills: true } } },
    });
    if (!user) return fail(res, 404, 'NOT_FOUND', 'User not found');

    const [sessions, events, counts] = await Promise.all([
      sessionService.listSessions(user.id),
      listUserEvents(user.id, { take: 50 }),
      prisma.$transaction([
        prisma.submission.count({ where: { userId: user.id } }),
        prisma.contestParticipant.count({ where: { userId: user.id } }),
      ]),
    ]);

    return ok(res, {
      user: toAdminUserDto(user),
      sessions,
      events,
      stats: { submissions: counts[0], contests: counts[1] },
      isConfiguredAdmin: isConfiguredAdmin(user.email),
    });
  } catch (err) {
    return next(err);
  }
}

/** GET /admin/users/:id/login-history — the account's authentication timeline. */
async function getLoginHistory(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!user) return fail(res, 404, 'NOT_FOUND', 'User not found');

    const events = await prisma.authEvent.findMany({
      where: {
        userId: user.id,
        type: { in: ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'LOGOUT_ALL', 'ACCOUNT_LOCKED', 'TOKEN_REUSE_DETECTED'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
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

    return ok(res, { events });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /admin/users/:id/status
 *
 * Enable or disable an account. Disabling revokes every session and bumps `tokenVersion`,
 * so the user is ejected on their very next request rather than when their access token
 * happens to expire.
 */
async function setUserStatus(req, res, next) {
  const context = describeRequest(req);
  try {
    const { isActive, reason } = req.body;

    if (req.params.id === req.user.id) {
      return fail(res, 400, 'SELF_ACTION', 'You cannot change the status of your own account');
    }

    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return fail(res, 404, 'NOT_FOUND', 'User not found');

    if (!isActive && isConfiguredAdmin(user.email)) {
      return fail(
        res,
        409,
        'PROTECTED_ADMIN',
        'This account is a configured administrator. Remove the address from ADMIN_EMAILS before disabling it.'
      );
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        isActive,
        disabledReason: isActive ? null : reason || 'Disabled by an administrator',
        // Re-enabling should not leave the user locked out by a stale lockout window.
        ...(isActive ? { failedLoginAttempts: 0, lockedUntil: null } : {}),
      },
    });

    if (!isActive) {
      await sessionService.revokeEverything(user.id, 'account_disabled');
    }

    track({
      type: isActive ? 'ACCOUNT_ENABLED' : 'ACCOUNT_DISABLED',
      userId: user.id,
      email: user.email,
      detail: `by admin ${req.user.email}${reason ? `: ${reason}` : ''}`,
      ...context,
    });

    return ok(res, {
      user: toAdminUserDto(updated),
      message: isActive ? 'Account enabled' : 'Account disabled and all sessions revoked',
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * PATCH /admin/users/:id/role
 *
 * Changing a role revokes sessions and bumps `tokenVersion`, because access tokens carry
 * the role they were minted with — without this the user would keep their old permissions
 * until the token expired.
 */
async function sendPasswordReset(req, res, next) {
  const context = describeRequest(req);
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return fail(res, 404, 'NOT_FOUND', 'User not found');

    await prisma.authToken.updateMany({
      where: { userId: user.id, type: 'PASSWORD_RESET', usedAt: null },
      data: { usedAt: new Date() },
    });

    const { token, tokenHash, expiresAt } = createEmailToken(authConfig.passwordResetTtlSec);
    await prisma.authToken.create({
      data: { userId: user.id, type: 'PASSWORD_RESET', tokenHash, expiresAt },
    });
    await mailer.sendPasswordResetEmail({ to: user.email, name: user.name, token });
    await sessionService.revokeEverything(user.id, 'admin_password_reset');

    track({
      type: 'PASSWORD_RESET_REQUESTED',
      userId: user.id,
      email: user.email,
      detail: `initiated by admin ${req.user.email}`,
      ...context,
    });

    return ok(res, {
      message: `A password reset link was sent to ${user.email} and their sessions were revoked.`,
      ...(IS_DEV
        ? { devResetUrl: `${authConfig.clientUrl}/reset-password?token=${encodeURIComponent(token)}` }
        : {}),
    });
  } catch (err) {
    return next(err);
  }
}

/** POST /admin/users/:id/unlock — clear a brute-force lockout early. */
async function unlockUser(req, res, next) {
  const context = describeRequest(req);
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return fail(res, 404, 'NOT_FOUND', 'User not found');

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });

    track({
      type: 'ACCOUNT_ENABLED',
      userId: user.id,
      email: user.email,
      detail: `lockout cleared by admin ${req.user.email}`,
      ...context,
    });

    return ok(res, { user: toAdminUserDto(updated), message: 'Lockout cleared' });
  } catch (err) {
    return next(err);
  }
}

/** POST /admin/users/:id/revoke-sessions — sign a user out of every device. */
async function revokeUserSessions(req, res, next) {
  const context = describeRequest(req);
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { id: true, email: true } });
    if (!user) return fail(res, 404, 'NOT_FOUND', 'User not found');

    const revoked = await sessionService.revokeEverything(user.id, 'admin_revoked');

    track({
      type: 'LOGOUT_ALL',
      userId: user.id,
      email: user.email,
      detail: `revoked by admin ${req.user.email}`,
      ...context,
    });

    return ok(res, { revokedSessions: revoked, message: `Revoked ${revoked} session(s)` });
  } catch (err) {
    return next(err);
  }
}

/** GET /admin/analytics/auth — headline account + authentication numbers. */
async function getAuthAnalytics(_req, res, next) {
  try {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

    const [
      total,
      active,
      disabled,
      unverified,
      admins,
      googleLinked,
      githubLinked,
      newThisWeek,
      activeToday,
      liveSessions,
      failedToday,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.user.count({ where: { emailVerified: false } }),
      prisma.user.count({ where: { role: ROLES.ADMIN } }),
      prisma.user.count({ where: { googleId: { not: null } } }),
      prisma.user.count({ where: { githubId: { not: null } } }),
      prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
      prisma.user.count({ where: { lastActive: { gte: dayAgo } } }),
      prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
      prisma.authEvent.count({ where: { type: 'LOGIN_FAILED', createdAt: { gte: dayAgo } } }),
    ]);

    return ok(res, {
      users: {
        total,
        active,
        disabled,
        unverified,
        admins,
        googleLinked,
        githubLinked,
        newThisWeek,
        activeToday,
      },
      sessions: { live: liveSessions },
      security: { failedLoginsLast24h: failedToday },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listUsers,
  getUser,
  getLoginHistory,
  setUserStatus,
  sendPasswordReset,
  unlockUser,
  revokeUserSessions,
  getAuthAnalytics,
};
