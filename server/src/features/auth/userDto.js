const { normalizeRole, permissionsFor } = require('../../shared/authz');

/**
 * Serialisation boundary for user records.
 *
 * Everything the API returns about a user goes through here. Prisma rows carry
 * `passwordHash`, `tokenVersion`, `failedLoginAttempts` and `lockedUntil`; none may reach
 * a client. These functions build their result field-by-field from an allow-list rather
 * than deleting sensitive keys from a spread, so a secret column added to the schema
 * later is excluded by default instead of leaking until someone remembers to blocklist it.
 *
 * Consequence for callers: query the *whole* row (no Prisma `select`) and let the DTO
 * narrow it. `hasPassword` and `googleLinked` need the secret fields to be present in
 * order to report the booleans the UI actually wants.
 */

/**
 * The DTO handed to a signed-in user about themselves.
 *
 * `hasPassword` / `googleLinked` are booleans *derived* from secrets, never the secrets:
 * the UI needs to know whether to offer "change password" or "link Google", not the hash
 * or the Google subject id.
 */
function toUserDto(user) {
  if (!user) return null;
  const role = normalizeRole(user.role);

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    mobile: user.mobile ?? null,
    role,
    permissions: permissionsFor(role),
    /** Canonical API name for the profile picture; stored in the `avatarUrl` column. */
    avatar: user.avatarUrl ?? null,
    avatarUrl: user.avatarUrl ?? null,
    emailVerified: Boolean(user.emailVerified),
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    mobileVerified: Boolean(user.mobileVerified),
    isActive: user.isActive !== false,
    hasPassword: Boolean(user.passwordHash),
    googleLinked: Boolean(user.googleId),
    lastLogin: user.lastLogin ?? null,
    lastActive: user.lastActive ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...(user.profile
      ? {
          profile: {
            bio: user.profile.bio ?? null,
            githubUrl: user.profile.githubUrl ?? null,
            linkedinUrl: user.profile.linkedinUrl ?? null,
            skills: (user.profile.userSkills || []).map((s) => s.skillName),
          },
        }
      : {}),
  };
}

/**
 * The DTO for admin user management. Same guarantees, plus the moderation fields an admin
 * needs — still no password hash and no token version.
 */
function toAdminUserDto(user) {
  if (!user) return null;
  return {
    ...toUserDto(user),
    disabledReason: user.disabledReason ?? null,
    isLocked: Boolean(user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()),
    lockedUntil: user.lockedUntil ?? null,
    failedLoginAttempts: user.failedLoginAttempts ?? 0,
    activeSessionCount: user._count?.sessions,
  };
}

module.exports = { toUserDto, toAdminUserDto };
