// Unit tests for the authentication building blocks. No database, no HTTP — these cover
// the pure logic that the flow tests then exercise end to end (see authFlow.test.js).

const { test } = require('node:test');
const assert = require('node:assert');

const { roleForEmail, authConfig } = require('../src/features/auth/authConfig');
const { reconcileRole } = require('../src/features/auth/authController');
const authz = require('../src/shared/authz');
const password = require('../src/features/auth/passwordService');
const tokens = require('../src/features/auth/tokenService');
const { toUserDto, toAdminUserDto } = require('../src/features/auth/userDto');
const { parseUserAgent } = require('../src/features/auth/requestContext');
const validators = require('../src/features/auth/authValidators');
const rateLimit = require('../src/shared/rateLimit');

// ===========================================================================
// Role assignment
// ===========================================================================

test('admin emails from config are granted ADMIN, everyone else USER', () => {
  for (const email of authConfig.adminEmails) {
    assert.strictEqual(roleForEmail(email), 'ADMIN', `${email} must be ADMIN`);
  }
  assert.strictEqual(roleForEmail('someone@example.com'), 'USER');
  assert.strictEqual(roleForEmail('alex@nexthire.dev'), 'USER');
});

test('role assignment is case- and whitespace-insensitive', () => {
  const admin = authConfig.adminEmails[0];
  assert.strictEqual(roleForEmail(admin.toUpperCase()), 'ADMIN');
  assert.strictEqual(roleForEmail(`  ${admin}  `), 'ADMIN');
});

test('roleForEmail never throws on junk input', () => {
  assert.strictEqual(roleForEmail(undefined), 'USER');
  assert.strictEqual(roleForEmail(null), 'USER');
  assert.strictEqual(roleForEmail(''), 'USER');
});

test('reconcileRole promotes configured admins and demotes stale ones', () => {
  const configuredAdmin = authConfig.adminEmails[0];

  // On the list -> ADMIN, whatever the stored role says.
  assert.strictEqual(reconcileRole({ email: configuredAdmin, role: 'USER' }), 'ADMIN');
  assert.strictEqual(reconcileRole({ email: configuredAdmin, role: 'ADMIN' }), 'ADMIN');

  // Off the list but stored as ADMIN -> demoted. This is what stops a removed admin
  // keeping their access.
  assert.strictEqual(reconcileRole({ email: 'nobody@example.com', role: 'ADMIN' }), 'USER');

  // An admin-assigned INTERVIEWER survives a login (the list only governs ADMIN).
  assert.strictEqual(reconcileRole({ email: 'nobody@example.com', role: 'INTERVIEWER' }), 'INTERVIEWER');

  // Legacy rows normalise.
  assert.strictEqual(reconcileRole({ email: 'nobody@example.com', role: 'CANDIDATE' }), 'USER');
});

// ===========================================================================
// Permission matrix
// ===========================================================================

test('permission matrix grants admins management capabilities and users none', () => {
  for (const permission of ['question:manage', 'contest:manage', 'user:manage', 'analytics:read']) {
    assert.ok(authz.hasPermission('ADMIN', permission), `ADMIN should have ${permission}`);
    assert.ok(!authz.hasPermission('USER', permission), `USER must not have ${permission}`);
    assert.ok(!authz.hasPermission('INTERVIEWER', permission), `INTERVIEWER must not have ${permission}`);
  }
});

test('users get the practice/contest/notes/progress capabilities from the brief', () => {
  for (const permission of [
    'practice:use',
    'contest:participate',
    'notes:manage',
    'progress:read',
    'sheet:read',
    'revision:use',
  ]) {
    assert.ok(authz.hasPermission('USER', permission), `USER should have ${permission}`);
  }
});

test('guests only get public read', () => {
  assert.deepStrictEqual(authz.GUEST_PERMISSIONS, ['public:read']);
  // An unknown/absent role must not fall through to a privileged set.
  assert.ok(!authz.hasPermission(undefined, 'question:manage'));
  assert.ok(!authz.hasPermission('NONSENSE', 'user:manage'));
});

test('legacy CANDIDATE role has exactly USER permissions', () => {
  assert.strictEqual(authz.normalizeRole('CANDIDATE'), 'USER');
  assert.deepStrictEqual(authz.permissionsFor('CANDIDATE'), authz.permissionsFor('USER'));
});

test('INTERVIEWER is a superset of USER (future-ready, no admin rights)', () => {
  const user = authz.permissionsFor('USER');
  const interviewer = authz.permissionsFor('INTERVIEWER');
  for (const permission of user) assert.ok(interviewer.includes(permission));
  assert.ok(interviewer.includes('interview:host'));
  assert.ok(!interviewer.includes('user:manage'));
});

// ===========================================================================
// Password service
// ===========================================================================

test('password policy enforces length, upper, lower and number', () => {
  assert.deepStrictEqual(password.passwordPolicyErrors('Abcdef12'), []);
  assert.ok(password.isPasswordAcceptable('Abcdef12'));

  assert.ok(password.passwordPolicyErrors('Ab1').includes('Must be at least 8 characters'));
  assert.ok(password.passwordPolicyErrors('abcdefg1').includes('Must contain an uppercase letter'));
  assert.ok(password.passwordPolicyErrors('ABCDEFG1').includes('Must contain a lowercase letter'));
  assert.ok(password.passwordPolicyErrors('Abcdefgh').includes('Must contain a number'));
});

test('bcrypt hashing uses the configured cost and never returns the plaintext', async () => {
  assert.strictEqual(authConfig.bcryptRounds, 12, 'the brief specifies 12 salt rounds');

  const hash = await password.hashPassword('Abcdef12');
  assert.match(hash, /^\$2[aby]\$12\$/, 'hash must record cost 12');
  assert.ok(!hash.includes('Abcdef12'));
});

test('the same password hashes differently each time (unique salts)', async () => {
  const [a, b] = await Promise.all([password.hashPassword('Abcdef12'), password.hashPassword('Abcdef12')]);
  assert.notStrictEqual(a, b);
  assert.ok(await password.verifyPassword('Abcdef12', a));
  assert.ok(await password.verifyPassword('Abcdef12', b));
});

test('verifyPassword rejects wrong passwords and missing hashes', async () => {
  const hash = await password.hashPassword('Abcdef12');
  assert.ok(await password.verifyPassword('Abcdef12', hash));
  assert.ok(!(await password.verifyPassword('abcdef12', hash)), 'must be case sensitive');
  assert.ok(!(await password.verifyPassword('wrong', hash)));

  // A Google-only account has no hash — this must be false, not a throw, so the caller
  // falls through to the generic "invalid credentials" path.
  assert.ok(!(await password.verifyPassword('Abcdef12', null)));
  assert.ok(!(await password.verifyPassword('Abcdef12', undefined)));
  assert.ok(!(await password.verifyPassword('', hash)));
});

test('passwords beyond bcrypt 72-byte limit are rejected, not silently truncated', async () => {
  const tooLong = `A1${'a'.repeat(80)}`;
  await assert.rejects(() => password.hashPassword(tooLong), /too long/i);

  // And a long candidate cannot match a short hash by sharing its first 72 bytes.
  const hash = await password.hashPassword('Abcdef12');
  assert.ok(!(await password.verifyPassword(tooLong, hash)));
});

// ===========================================================================
// Token service
// ===========================================================================

test('access tokens round-trip and carry role, tokenVersion and session id', () => {
  const token = tokens.signAccessToken({
    userId: 'user-1',
    email: 'a@b.co',
    role: 'ADMIN',
    tokenVersion: 7,
    sessionId: 'sess-1',
  });

  const result = tokens.verifyAccessToken(token);
  assert.ok(result.ok);
  assert.strictEqual(result.payload.sub, 'user-1');
  assert.strictEqual(result.payload.role, 'ADMIN');
  assert.strictEqual(result.payload.tv, 7);
  assert.strictEqual(result.payload.sid, 'sess-1');
});

test('access tokens normalise a legacy role rather than emitting CANDIDATE', () => {
  const token = tokens.signAccessToken({ userId: 'u', email: 'a@b.co', role: 'CANDIDATE', tokenVersion: 0 });
  assert.strictEqual(tokens.verifyAccessToken(token).payload.role, 'USER');
});

test('a tampered access token is rejected as invalid', () => {
  const token = tokens.signAccessToken({ userId: 'u', email: 'a@b.co', role: 'USER', tokenVersion: 0 });
  const [header, payload, signature] = token.split('.');

  // Re-encode the payload with role escalated to ADMIN, keeping the original signature.
  const forgedPayload = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), role: 'ADMIN' })
  ).toString('base64url');

  const forged = `${header}.${forgedPayload}.${signature}`;
  const result = tokens.verifyAccessToken(forged);
  assert.ok(!result.ok);
  assert.strictEqual(result.reason, 'invalid');
});

test('an expired access token reports "expired", not "invalid"', () => {
  // The client uses this distinction to decide whether to refresh or to sign out.
  const jwt = require('jsonwebtoken');
  const expired = jwt.sign({ sub: 'u', role: 'USER', tv: 0 }, authConfig.accessTokenSecret, {
    expiresIn: -10,
    issuer: authConfig.jwtIssuer,
    audience: authConfig.jwtAudience,
  });

  const result = tokens.verifyAccessToken(expired);
  assert.ok(!result.ok);
  assert.strictEqual(result.reason, 'expired');
});

test('a token signed with the wrong secret or audience is rejected', () => {
  const jwt = require('jsonwebtoken');

  const wrongSecret = jwt.sign({ sub: 'u' }, 'not-the-secret', {
    issuer: authConfig.jwtIssuer,
    audience: authConfig.jwtAudience,
  });
  assert.ok(!tokens.verifyAccessToken(wrongSecret).ok);

  const wrongAudience = jwt.sign({ sub: 'u' }, authConfig.accessTokenSecret, {
    issuer: authConfig.jwtIssuer,
    audience: 'some-other-app',
  });
  assert.ok(!tokens.verifyAccessToken(wrongAudience).ok);
});

test('garbage in the Authorization header is rejected without throwing', () => {
  for (const value of ['', 'abc', 'a.b.c', 'null', '{}']) {
    assert.ok(!tokens.verifyAccessToken(value).ok);
  }
});

test('refresh tokens are high-entropy, unique, and stored only as a hash', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const { token, tokenHash } = tokens.createRefreshToken();
    assert.ok(token.length >= 40, 'expect a 256-bit base64url token');
    assert.match(tokenHash, /^[0-9a-f]{64}$/, 'stored value must be a sha256 hex digest');
    assert.notStrictEqual(tokenHash, token, 'the raw token must never be the stored value');
    assert.ok(!seen.has(token), 'tokens must not repeat');
    seen.add(token);
  }
});

test('remember-me refresh tokens get the long TTL', () => {
  const normal = tokens.createRefreshToken({ rememberMe: false });
  const remembered = tokens.createRefreshToken({ rememberMe: true });

  assert.strictEqual(normal.ttlSec, authConfig.refreshTokenTtlSec);
  assert.strictEqual(remembered.ttlSec, authConfig.refreshTokenRememberTtlSec);
  assert.ok(remembered.ttlSec > normal.ttlSec);
});

test('hashToken is deterministic and safeEqual is length-safe', () => {
  assert.strictEqual(tokens.hashToken('abc'), tokens.hashToken('abc'));
  assert.notStrictEqual(tokens.hashToken('abc'), tokens.hashToken('abd'));

  assert.ok(tokens.safeEqual('abc', 'abc'));
  assert.ok(!tokens.safeEqual('abc', 'abd'));
  // Different lengths must return false rather than throw (timingSafeEqual would).
  assert.ok(!tokens.safeEqual('abc', 'abcdef'));
  assert.ok(!tokens.safeEqual(undefined, 'abc'));
});

// ===========================================================================
// Serialisation — the thing that must never leak
// ===========================================================================

const SECRET_FIELDS = ['passwordHash', 'tokenVersion', 'passwordChangedAt'];

function fullUserRow(overrides = {}) {
  return {
    id: 'u1',
    email: 'user@example.com',
    name: 'Test User',
    mobile: '+919876543210',
    role: 'USER',
    avatarUrl: 'https://example.com/a.png',
    googleId: 'google-sub-123',
    passwordHash: '$2a$12$abcdefghijklmnopqrstuv',
    passwordChangedAt: new Date(),
    tokenVersion: 4,
    failedLoginAttempts: 3,
    lockedUntil: null,
    emailVerified: true,
    emailVerifiedAt: new Date(),
    mobileVerified: false,
    isActive: true,
    disabledReason: null,
    isVerified: true,
    lastLogin: new Date(),
    lastActive: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

test('toUserDto never exposes the password hash or token version', () => {
  const dto = toUserDto(fullUserRow());
  const serialised = JSON.stringify(dto);

  for (const field of SECRET_FIELDS) {
    assert.ok(!(field in dto), `${field} must not be present in the DTO`);
  }
  assert.ok(!serialised.includes('$2a$12$'), 'the bcrypt hash must not appear anywhere');
  assert.ok(!serialised.includes('google-sub-123'), 'the raw Google subject id must not be exposed');
  assert.ok(!('failedLoginAttempts' in dto), 'lockout internals are admin-only');
});

test('toUserDto reports capability booleans instead of the secrets behind them', () => {
  const withSecrets = toUserDto(fullUserRow());
  assert.strictEqual(withSecrets.hasPassword, true);
  assert.strictEqual(withSecrets.googleLinked, true);

  const bare = toUserDto(fullUserRow({ passwordHash: null, googleId: null }));
  assert.strictEqual(bare.hasPassword, false);
  assert.strictEqual(bare.googleLinked, false);
});

test('toUserDto normalises the legacy role and includes the permission list', () => {
  const dto = toUserDto(fullUserRow({ role: 'CANDIDATE' }));
  assert.strictEqual(dto.role, 'USER');
  assert.deepStrictEqual(dto.permissions, authz.permissionsFor('USER'));
});

test('a new secret column is excluded by default (allow-list, not blocklist)', () => {
  // Simulates someone adding a sensitive column to the schema without updating the DTO.
  const dto = toUserDto(fullUserRow({ totpSecret: 'JBSWY3DPEHPK3PXP' }));
  assert.ok(!('totpSecret' in dto));
  assert.ok(!JSON.stringify(dto).includes('JBSWY3DPEHPK3PXP'));
});

test('toAdminUserDto adds moderation fields but still hides the hash', () => {
  const locked = toAdminUserDto(fullUserRow({ lockedUntil: new Date(Date.now() + 60_000) }));
  assert.strictEqual(locked.isLocked, true);
  assert.strictEqual(locked.failedLoginAttempts, 3);
  assert.ok(!('passwordHash' in locked));
  assert.ok(!JSON.stringify(locked).includes('$2a$12$'));

  const stale = toAdminUserDto(fullUserRow({ lockedUntil: new Date(Date.now() - 60_000) }));
  assert.strictEqual(stale.isLocked, false, 'an elapsed lockout is not locked');
});

// ===========================================================================
// Validators
// ===========================================================================

function parse(schema, input) {
  return schema.safeParse(input);
}

const VALID_REGISTRATION = {
  name: 'Sarah Jenkins',
  email: 'Sarah.Jenkins@Example.COM',
  mobile: '+91 98765 43210',
  password: 'StrongPass1',
  confirmPassword: 'StrongPass1',
};

test('registration sanitises email to lowercase and normalises the mobile to E.164', () => {
  const result = parse(validators.registerSchema, VALID_REGISTRATION);
  assert.ok(result.success, JSON.stringify(result.error?.issues));
  assert.strictEqual(result.data.email, 'sarah.jenkins@example.com');
  assert.strictEqual(result.data.mobile, '+919876543210');
  assert.strictEqual(result.data.name, 'Sarah Jenkins');
});

test('registration rejects a short name', () => {
  const result = parse(validators.registerSchema, { ...VALID_REGISTRATION, name: 'Ab' });
  assert.ok(!result.success);
  assert.match(validators.fieldErrors(result.error).name, /at least 3 characters/);
});

test('registration rejects an invalid email', () => {
  for (const email of ['not-an-email', 'a@', '@b.com', 'a b@c.com']) {
    const result = parse(validators.registerSchema, { ...VALID_REGISTRATION, email });
    assert.ok(!result.success, `${email} should be rejected`);
  }
});

test('registration rejects an invalid mobile number', () => {
  for (const mobile of ['123', 'abcdefghij', '+', '1234567890123456789']) {
    const result = parse(validators.registerSchema, { ...VALID_REGISTRATION, mobile });
    assert.ok(!result.success, `${mobile} should be rejected`);
  }
});

test('registration enforces the full password policy', () => {
  const cases = {
    Short1A: /at least 8 characters/,
    alllowercase1: /uppercase/,
    ALLUPPERCASE1: /lowercase/,
    NoNumbersHere: /number/,
  };

  for (const [password, expected] of Object.entries(cases)) {
    const result = parse(validators.registerSchema, {
      ...VALID_REGISTRATION,
      password,
      confirmPassword: password,
    });
    assert.ok(!result.success, `${password} should be rejected`);
    assert.match(validators.fieldErrors(result.error).password, expected);
  }
});

test('registration requires confirmPassword to match', () => {
  const result = parse(validators.registerSchema, {
    ...VALID_REGISTRATION,
    confirmPassword: 'DifferentPass1',
  });
  assert.ok(!result.success);
  assert.match(validators.fieldErrors(result.error).confirmPassword, /do not match/);
});

test('registration rejects a password containing the email handle', () => {
  const result = parse(validators.registerSchema, {
    ...VALID_REGISTRATION,
    email: 'sarahjenkins@example.com',
    password: 'Sarahjenkins1',
    confirmPassword: 'Sarahjenkins1',
  });
  assert.ok(!result.success);
  assert.match(validators.fieldErrors(result.error).password, /must not contain your email name/);
});

test('registration ignores a client-supplied role — roles are never taken from the body', () => {
  const result = parse(validators.registerSchema, { ...VALID_REGISTRATION, role: 'ADMIN' });
  assert.ok(result.success);
  assert.ok(!('role' in result.data), 'a role in the request body must be stripped');
});

test('login accepts any non-empty password but still normalises the email', () => {
  const result = parse(validators.loginSchema, { email: '  USER@Example.com ', password: 'x' });
  assert.ok(result.success);
  assert.strictEqual(result.data.email, 'user@example.com');

  assert.ok(!parse(validators.loginSchema, { email: 'user@example.com', password: '' }).success);
});

test('avatar URLs must be http(s) — javascript: and data: are rejected', () => {
  for (const avatarUrl of ['javascript:alert(1)', 'data:text/html;base64,PHN2Zz4=', 'ftp://x/y.png']) {
    const result = parse(validators.updateProfileSchema, { avatarUrl });
    assert.ok(!result.success, `${avatarUrl} should be rejected`);
  }
  assert.ok(parse(validators.updateProfileSchema, { avatarUrl: 'https://example.com/a.png' }).success);
});

test('name rejects markup that would otherwise be stored and echoed back', () => {
  const result = parse(validators.registerSchema, {
    ...VALID_REGISTRATION,
    name: '<script>alert(1)</script>',
  });
  assert.ok(!result.success);
});

test('change-password requires the confirmation to match and the value to differ', () => {
  assert.ok(
    !parse(validators.changePasswordSchema, {
      currentPassword: 'OldPass123',
      newPassword: 'NewPass123',
      confirmPassword: 'Mismatch123',
    }).success
  );

  assert.ok(
    !parse(validators.changePasswordSchema, {
      currentPassword: 'SamePass123',
      newPassword: 'SamePass123',
      confirmPassword: 'SamePass123',
    }).success
  );

  // No current password: valid, and used by a Google-only account setting its first one.
  assert.ok(
    parse(validators.changePasswordSchema, {
      newPassword: 'NewPass123',
      confirmPassword: 'NewPass123',
    }).success
  );
});

test('admin role updates only accept assignable roles', () => {
  for (const role of authz.ASSIGNABLE_ROLES) {
    assert.ok(parse(validators.adminUpdateRoleSchema, { role }).success);
  }
  assert.ok(!parse(validators.adminUpdateRoleSchema, { role: 'CANDIDATE' }).success);
  assert.ok(!parse(validators.adminUpdateRoleSchema, { role: 'SUPERUSER' }).success);
});

test('fieldErrors flattens a ZodError into one message per field', () => {
  const result = parse(validators.registerSchema, { name: 'Ab', email: 'bad', mobile: '1', password: 'x' });
  assert.ok(!result.success);
  const fields = validators.fieldErrors(result.error);
  assert.ok(fields.name && fields.email && fields.mobile && fields.password);
  for (const message of Object.values(fields)) assert.strictEqual(typeof message, 'string');
});

// ===========================================================================
// Request context
// ===========================================================================

test('user agents are parsed into readable browser/os/device labels', () => {
  const chromeWindows = parseUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  assert.match(chromeWindows.browser, /^Chrome/);
  assert.strictEqual(chromeWindows.os, 'Windows');
  assert.strictEqual(chromeWindows.device, 'Desktop');

  const iphone = parseUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
  );
  assert.strictEqual(iphone.os, 'iOS');
  assert.strictEqual(iphone.device, 'Mobile');

  // Edge and Opera both claim to be Chrome; order of matching matters.
  assert.match(
    parseUserAgent('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537.36 Edg/120.0.0.0').browser,
    /^Edge/
  );

  const unknown = parseUserAgent(undefined);
  assert.strictEqual(unknown.browser, 'Unknown');
  assert.strictEqual(unknown.userAgent, null);
});

test('an over-long user agent is truncated before storage', () => {
  const parsed = parseUserAgent('A'.repeat(5000));
  assert.ok(parsed.userAgent.length <= 512);
});

// ===========================================================================
// Rate limiting
// ===========================================================================

test('the rate limiter allows up to the limit then blocks with a retry hint', () => {
  rateLimit.resetAll();
  const options = { limit: 3, windowSec: 60 };

  for (let i = 0; i < 3; i += 1) {
    assert.ok(rateLimit.consume('test:key', options).allowed, `attempt ${i + 1} should be allowed`);
  }

  const blocked = rateLimit.consume('test:key', options);
  assert.ok(!blocked.allowed);
  assert.ok(blocked.retryAfterSec > 0 && blocked.retryAfterSec <= 60);
  assert.strictEqual(blocked.remaining, 0);
});

test('rate limit buckets are independent per key and resettable', () => {
  rateLimit.resetAll();
  const options = { limit: 1, windowSec: 60 };

  assert.ok(rateLimit.consume('a', options).allowed);
  assert.ok(!rateLimit.consume('a', options).allowed);
  // A different key (different IP/email) is unaffected.
  assert.ok(rateLimit.consume('b', options).allowed);

  // A successful login clears the caller's bucket.
  rateLimit.reset('a');
  assert.ok(rateLimit.consume('a', options).allowed);
});
