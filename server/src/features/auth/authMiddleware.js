const { prisma } = require('../../shared/db');
const { verifyAccessToken } = require('./tokenService');
const { normalizeRole, hasPermission, ROLES } = require('../../shared/authz');

/**
 * Request authentication and authorization.
 *
 * An access token being *cryptographically* valid is not enough to act on. Every
 * authenticated request also confirms, against the database, that:
 *   • the user still exists,
 *   • the account is still enabled (`isActive`),
 *   • the token's `tv` still matches `user.tokenVersion` — so logout-everywhere,
 *     password change/reset, account disable and role change all take effect
 *     immediately instead of waiting out the access token's TTL,
 *   • the token's session (`sid`) has not been revoked or expired.
 *
 * That is one indexed lookup per request, which is the right trade for being able to
 * revoke access in real time.
 *
 * Error codes are stable and machine-readable so the client can tell "refresh me"
 * (TOKEN_EXPIRED) apart from "stop and sign in again" (everything else).
 */

const BEARER = /^Bearer\s+(.+)$/i;

function bearerToken(req) {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = BEARER.exec(header.trim());
  return match ? match[1].trim() : null;
}

function unauthorized(res, code, error) {
  return res.status(401).json({ success: false, error, code });
}

/**
 * Resolve a bearer token to a live user + session.
 * @returns {Promise<{ok: true, user: object, payload: object} | {ok: false, code: string, error: string}>}
 */
async function resolveAccessToken(token) {
  const verified = verifyAccessToken(token);
  if (!verified.ok) {
    return verified.reason === 'expired'
      ? { ok: false, code: 'TOKEN_EXPIRED', error: 'Your session has expired' }
      : { ok: false, code: 'TOKEN_INVALID', error: 'Invalid authentication token' };
  }

  const payload = verified.payload;
  const user = await prisma.user.findUnique({ where: { id: payload.sub } });

  if (!user) {
    return { ok: false, code: 'USER_NOT_FOUND', error: 'Account no longer exists' };
  }
  if (!user.isActive) {
    return {
      ok: false,
      code: 'ACCOUNT_DISABLED',
      error: user.disabledReason
        ? `Account disabled: ${user.disabledReason}`
        : 'This account has been disabled',
    };
  }
  // Stale version => the account was invalidated after this token was minted.
  if ((payload.tv ?? 0) !== user.tokenVersion) {
    return { ok: false, code: 'TOKEN_REVOKED', error: 'Your session is no longer valid' };
  }

  if (payload.sid) {
    const session = await prisma.session.findUnique({
      where: { id: payload.sid },
      select: { revokedAt: true, expiresAt: true },
    });
    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      return { ok: false, code: 'SESSION_REVOKED', error: 'This device has been signed out' };
    }
  }

  return { ok: true, user, payload };
}

/**
 * Throttle `lastActive` writes. Updating it on literally every request would turn each
 * read into a write; a 60s granularity is plenty for "last seen".
 */
const LAST_ACTIVE_THROTTLE_MS = 60_000;
function touchLastActive(user) {
  const previous = user.lastActive ? new Date(user.lastActive).getTime() : 0;
  if (Date.now() - previous < LAST_ACTIVE_THROTTLE_MS) return;

  prisma.user
    .update({ where: { id: user.id }, data: { lastActive: new Date() } })
    .catch((err) => console.error('[auth] lastActive update failed:', err.message));
}

/** Attach the canonical request-scoped identity. */
function attachIdentity(req, user, payload) {
  const role = normalizeRole(user.role);
  req.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    role,
    emailVerified: Boolean(user.emailVerified),
    isActive: user.isActive !== false,
    sessionId: payload?.sid || null,
    tokenVersion: user.tokenVersion,
  };
  /** The full Prisma row, for handlers that need more than the identity. */
  req.userRecord = user;
  req.sessionId = payload?.sid || null;
}

/** Hard gate: a valid, live access token is required. */
async function requireAuthenticated(req, res, next) {
  try {
    const token = bearerToken(req);
    if (!token) {
      return unauthorized(res, 'TOKEN_MISSING', 'Authentication required');
    }

    const result = await resolveAccessToken(token);
    if (!result.ok) {
      return unauthorized(res, result.code, result.error);
    }

    attachIdentity(req, result.user, result.payload);
    touchLastActive(result.user);
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Soft gate: attach `req.user` when a valid token is present, otherwise continue
 * anonymously. Lets public endpoints (browsing the library) personalise for signed-in
 * users without locking anonymous visitors out.
 */
async function attachUser(req, _res, next) {
  try {
    const token = bearerToken(req);
    if (!token) return next();

    const result = await resolveAccessToken(token);
    if (result.ok) {
      attachIdentity(req, result.user, result.payload);
      touchLastActive(result.user);
    }
    return next();
  } catch {
    // Never fail an optional-auth request because of an auth problem.
    return next();
  }
}

/**
 * Require a verified email address. Applied to endpoints that create durable state, so an
 * unverified signup can sign in and see its "please verify" banner but cannot yet write.
 * Skipped entirely when EMAIL_VERIFICATION_REQUIRED=false (useful for local demos).
 */
function requireEmailVerified(req, res, next) {
  if (process.env.EMAIL_VERIFICATION_REQUIRED === 'false') return next();
  if (!req.user) return unauthorized(res, 'TOKEN_MISSING', 'Authentication required');

  if (!req.user.emailVerified) {
    return res.status(403).json({
      success: false,
      error: 'Verify your email address to continue',
      code: 'EMAIL_NOT_VERIFIED',
    });
  }
  return next();
}

/**
 * Require a capability from the permission matrix (shared/authz.js). Routes describe what
 * they need, not who is allowed — so adding a role is a change to the matrix and nothing
 * else. This is the only authorization primitive; the old requireRole/requireAdmin pair was
 * unused and has been removed rather than left as a second way to spell the same thing.
 */
function requirePermission(permission) {
  return function requirePermissionMiddleware(req, res, next) {
    if (!req.user) return unauthorized(res, 'TOKEN_MISSING', 'Authentication required');
    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to perform this action',
        code: 'FORBIDDEN',
        requiredPermission: permission,
      });
    }
    return next();
  };
}

/** Resource-scoped: only a contest's own host (or an admin) may manage it. */
async function requireContestHost(req, res, next) {
  try {
    const contestId = req.params.contestId || req.params.id;
    if (!contestId) return next();

    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) {
      return res.status(404).json({ success: false, error: 'Contest not found', code: 'NOT_FOUND' });
    }

    if (contest.hostId !== req.user.id && req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        error: 'Requires Contest Host permission',
        code: 'FORBIDDEN',
      });
    }

    req.contest = contest;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  requireAuthenticated,
  attachUser,
  requireEmailVerified,
  requirePermission,
  requireContestHost,
  resolveAccessToken,
  bearerToken,
};
