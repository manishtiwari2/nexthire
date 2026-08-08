/**
 * Single source of truth for roles and permissions.
 *
 * Routes declare the *permission* they need (`requirePermission('question:manage')`)
 * rather than a role, so adding INTERVIEWER capabilities later is a change to this table
 * and nothing else. The client imports the same permission names via `/auth/me`, which
 * returns the caller's resolved permission list — the UI never recomputes the matrix.
 */

const ROLES = {
  ADMIN: 'ADMIN',
  USER: 'USER',
  INTERVIEWER: 'INTERVIEWER',
  /** @deprecated legacy alias for USER; still present in old rows. */
  CANDIDATE: 'CANDIDATE',
};

/** Everything a signed-out visitor may reach. */
const GUEST_PERMISSIONS = ['public:read'];

const USER_PERMISSIONS = [
  ...GUEST_PERMISSIONS,
  'practice:use',
  'contest:participate',
  'notes:manage',
  'progress:read',
  'sheet:read',
  'sheet:manage-own',
  'revision:use',
  'submission:create',
  'profile:manage',
];

const INTERVIEWER_PERMISSIONS = [
  ...USER_PERMISSIONS,
  'interview:host',
];

const ADMIN_PERMISSIONS = [
  ...INTERVIEWER_PERMISSIONS,
  'question:manage',
  'contest:manage',
  'user:manage',
  'analytics:read',
  'submission:manage',
];

const PERMISSIONS_BY_ROLE = {
  [ROLES.ADMIN]: ADMIN_PERMISSIONS,
  [ROLES.INTERVIEWER]: INTERVIEWER_PERMISSIONS,
  [ROLES.USER]: USER_PERMISSIONS,
  [ROLES.CANDIDATE]: USER_PERMISSIONS,
};

/** Roles an admin may assign through the user-management API. */
const ASSIGNABLE_ROLES = [ROLES.USER, ROLES.INTERVIEWER, ROLES.ADMIN];

/**
 * Normalise a stored role to its canonical form. Old rows may still say CANDIDATE;
 * everything downstream should only ever see USER.
 */
function normalizeRole(role) {
  if (role === ROLES.CANDIDATE) return ROLES.USER;
  return PERMISSIONS_BY_ROLE[role] ? role : ROLES.USER;
}

function permissionsFor(role) {
  return PERMISSIONS_BY_ROLE[normalizeRole(role)] || GUEST_PERMISSIONS;
}

function hasPermission(role, permission) {
  return permissionsFor(role).includes(permission);
}

module.exports = {
  ROLES,
  ASSIGNABLE_ROLES,
  GUEST_PERMISSIONS,
  PERMISSIONS_BY_ROLE,
  normalizeRole,
  permissionsFor,
  hasPermission,
};
