// End-to-end authentication tests.
//
// These run the *real* Express router, middleware stack and Prisma client against the local
// Postgres, over real HTTP on an ephemeral port — so cookies, CSRF, refresh rotation and the
// middleware's database checks are all genuinely exercised rather than mocked.
//
// Environment is configured before any application module is required, because authConfig
// snapshots process.env at load time.

process.env.DISABLE_RATE_LIMIT = '1'; // otherwise the suite would be order-dependent
process.env.ADMIN_EMAILS = 'flow-admin@nexthire.test';
process.env.EMAIL_VERIFICATION_REQUIRED = 'true';
process.env.AUTH_VERBOSE_LOGIN_ERRORS = 'false'; // assert the production-safe generic messages
process.env.MAX_FAILED_LOGIN_ATTEMPTS = '4';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');

const { prisma } = require('../src/shared/db');
const authRoutes = require('../src/features/auth/authRoutes');
const libraryRoutes = require('../src/features/library/libraryRoutes');
const { authConfig } = require('../src/features/auth/authConfig');
const { hashToken } = require('../src/features/auth/tokenService');

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const TEST_EMAILS = [
  'flow-user@nexthire.test',
  'flow-admin@nexthire.test',
  'flow-second@nexthire.test',
  'flow-disabled@nexthire.test',
  'flow-locked@nexthire.test',
];

let server;
let baseUrl;
let originalConsoleLog;

before(async () => {
  // The console mail transport prints a banner per email; keep the reporter readable.
  originalConsoleLog = console.log;
  console.log = () => {};

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/library', libraryRoutes);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  await cleanupTestUsers();
});

after(async () => {
  console.log = originalConsoleLog;
  await cleanupTestUsers();
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

async function cleanupTestUsers() {
  // Sessions, auth tokens and events cascade from User.
  await prisma.user.deleteMany({ where: { email: { in: TEST_EMAILS } } });
}

/**
 * A tiny cookie jar. `fetch` does not persist cookies, and the whole point of these tests is
 * that the refresh token lives in one.
 */
class Client {
  constructor() {
    this.cookies = new Map();
    this.accessToken = null;
  }

  get csrf() {
    return this.cookies.get(authConfig.cookies.csrfName) || null;
  }

  get refreshToken() {
    return this.cookies.get(authConfig.cookies.refreshName) || null;
  }

  setCookie(name, value) {
    this.cookies.set(name, value);
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  absorb(response) {
    for (const raw of response.headers.getSetCookie?.() || []) {
      const [pair] = raw.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      // An empty value is how Express clears a cookie.
      if (!value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async request(method, path, { body, headers = {}, withCsrf = false, auth = true } = {}) {
    const finalHeaders = { 'Content-Type': 'application/json', ...headers };

    if (auth && this.accessToken) finalHeaders.Authorization = `Bearer ${this.accessToken}`;
    if (this.cookies.size) finalHeaders.Cookie = this.cookieHeader();
    if (withCsrf && this.csrf) finalHeaders[authConfig.csrfHeaderName] = this.csrf;

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    this.absorb(response);
    const payload = await response.json().catch(() => null);
    return { status: response.status, body: payload, headers: response.headers };
  }

  get(path, options) {
    return this.request('GET', path, options);
  }
  post(path, body, options) {
    return this.request('POST', path, { body, ...options });
  }
  patch(path, body, options) {
    return this.request('PATCH', path, { body, ...options });
  }
  del(path, options) {
    return this.request('DELETE', path, options);
  }
}

const VALID_PASSWORD = 'FlowTest123';

function registration(overrides = {}) {
  return {
    name: 'Flow User',
    email: 'flow-user@nexthire.test',
    mobile: '+15550001111',
    password: VALID_PASSWORD,
    confirmPassword: VALID_PASSWORD,
    ...overrides,
  };
}

function tokenFromUrl(url) {
  return new URL(url).searchParams.get('token');
}

/** Register + verify + sign in, returning a ready-to-use client. */
async function createVerifiedUser(overrides = {}, { rememberMe = false } = {}) {
  const client = new Client();
  const data = registration(overrides);

  const registered = await client.post('/auth/register', data);
  assert.strictEqual(registered.status, 201, JSON.stringify(registered.body));

  const verified = await client.post('/auth/verify-email', {
    token: tokenFromUrl(registered.body.data.devVerificationUrl),
  });
  assert.strictEqual(verified.status, 200);

  const loggedIn = await client.post('/auth/login', {
    email: data.email,
    password: data.password,
    rememberMe,
  });
  assert.strictEqual(loggedIn.status, 200, JSON.stringify(loggedIn.body));
  client.accessToken = loggedIn.body.data.accessToken;

  return { client, user: loggedIn.body.data.user, email: data.email };
}

beforeEach(cleanupTestUsers);

// ===========================================================================
// Registration
// ===========================================================================

test('registration creates an account without signing the user in', async () => {
  const client = new Client();
  const response = await client.post('/auth/register', registration());

  assert.strictEqual(response.status, 201);
  assert.strictEqual(response.body.success, true);
  assert.strictEqual(response.body.data.user.email, 'flow-user@nexthire.test');
  assert.strictEqual(response.body.data.user.emailVerified, false);
  assert.strictEqual(response.body.data.user.role, 'USER');

  // No session is established — the account is inert until verified.
  assert.ok(!response.body.data.accessToken, 'registration must not return an access token');
  assert.strictEqual(client.refreshToken, null, 'registration must not set a refresh cookie');
});

test('registration never returns the password hash', async () => {
  const client = new Client();
  const response = await client.post('/auth/register', registration());
  const serialised = JSON.stringify(response.body);

  assert.ok(!serialised.includes('$2a$'), 'no bcrypt hash may appear in the response');
  assert.ok(!serialised.includes('$2b$'));
  assert.ok(!serialised.includes(VALID_PASSWORD), 'the plaintext password must not be echoed');
  assert.ok(!('passwordHash' in response.body.data.user));
});

test('the stored password is a bcrypt hash at cost 12, not the plaintext', async () => {
  const client = new Client();
  await client.post('/auth/register', registration());

  const stored = await prisma.user.findUnique({ where: { email: 'flow-user@nexthire.test' } });
  assert.ok(stored.passwordHash);
  assert.notStrictEqual(stored.passwordHash, VALID_PASSWORD);
  assert.match(stored.passwordHash, /^\$2[aby]\$12\$/);
});

test('a duplicate email is reported as a field error', async () => {
  const client = new Client();
  await client.post('/auth/register', registration());

  const duplicate = await client.post(
    '/auth/register',
    registration({ mobile: '+15550002222' }) // same email, different mobile
  );

  assert.strictEqual(duplicate.status, 409);
  assert.strictEqual(duplicate.body.code, 'ALREADY_EXISTS');
  assert.match(duplicate.body.fields.email, /already exists/i);
  assert.ok(!duplicate.body.fields.mobile);
});

test('a duplicate mobile is reported as a field error', async () => {
  const client = new Client();
  await client.post('/auth/register', registration());

  const duplicate = await client.post(
    '/auth/register',
    registration({ email: 'flow-second@nexthire.test' }) // same mobile, different email
  );

  assert.strictEqual(duplicate.status, 409);
  assert.match(duplicate.body.fields.mobile, /already exists/i);
  assert.ok(!duplicate.body.fields.email);
});

test('a duplicate email differing only in case is still a duplicate', async () => {
  const client = new Client();
  await client.post('/auth/register', registration());

  const duplicate = await client.post(
    '/auth/register',
    registration({ email: 'FLOW-USER@NEXTHIRE.TEST', mobile: '+15550003333' })
  );
  assert.strictEqual(duplicate.status, 409);
  assert.match(duplicate.body.fields.email, /already exists/i);
});

test('registration rejects a weak password with per-field messages', async () => {
  const client = new Client();
  const response = await client.post('/auth/register', registration({ password: 'weak', confirmPassword: 'weak' }));

  assert.strictEqual(response.status, 422);
  assert.strictEqual(response.body.code, 'VALIDATION_ERROR');
  assert.ok(response.body.fields.password);
});

test('registration rejects a mismatched confirmation', async () => {
  const client = new Client();
  const response = await client.post('/auth/register', registration({ confirmPassword: 'Different123' }));

  assert.strictEqual(response.status, 422);
  assert.match(response.body.fields.confirmPassword, /do not match/i);
});

test('a client-supplied role is ignored — the server assigns it', async () => {
  const client = new Client();
  const response = await client.post('/auth/register', { ...registration(), role: 'ADMIN' });

  assert.strictEqual(response.status, 201);
  assert.strictEqual(response.body.data.user.role, 'USER', 'the body must not be able to grant ADMIN');

  const stored = await prisma.user.findUnique({ where: { email: 'flow-user@nexthire.test' } });
  assert.strictEqual(stored.role, 'USER');
});

test('an email on the configured admin list is registered as ADMIN', async () => {
  const client = new Client();
  const response = await client.post(
    '/auth/register',
    registration({ email: 'flow-admin@nexthire.test', mobile: '+15550009999' })
  );

  assert.strictEqual(response.status, 201);
  assert.strictEqual(response.body.data.user.role, 'ADMIN');
});

// ===========================================================================
// Email verification
// ===========================================================================

test('login is refused until the email address is verified', async () => {
  const client = new Client();
  await client.post('/auth/register', registration());

  const response = await client.post('/auth/login', {
    email: 'flow-user@nexthire.test',
    password: VALID_PASSWORD,
  });

  assert.strictEqual(response.status, 403);
  assert.strictEqual(response.body.code, 'EMAIL_NOT_VERIFIED');
  assert.strictEqual(response.body.canResend, true);
});

test('the verification link verifies the account and is then idempotent', async () => {
  const client = new Client();
  const registered = await client.post('/auth/register', registration());
  const token = tokenFromUrl(registered.body.data.devVerificationUrl);

  const first = await client.post('/auth/verify-email', { token });
  assert.strictEqual(first.status, 200);
  assert.strictEqual(first.body.data.verified, true);

  // Clicking the emailed link twice must not look like a failure.
  const second = await client.post('/auth/verify-email', { token });
  assert.strictEqual(second.status, 200);
  assert.strictEqual(second.body.data.alreadyVerified, true);

  const stored = await prisma.user.findUnique({ where: { email: 'flow-user@nexthire.test' } });
  assert.strictEqual(stored.emailVerified, true);
  assert.ok(stored.emailVerifiedAt);
});

test('an invalid verification token is rejected', async () => {
  const client = new Client();
  const response = await client.post('/auth/verify-email', { token: 'a'.repeat(43) });

  assert.strictEqual(response.status, 400);
  assert.strictEqual(response.body.code, 'TOKEN_INVALID');
});

test('an expired verification token is rejected', async () => {
  const client = new Client();
  const registered = await client.post('/auth/register', registration());
  const token = tokenFromUrl(registered.body.data.devVerificationUrl);

  await prisma.authToken.update({
    where: { tokenHash: hashToken(token) },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  const response = await client.post('/auth/verify-email', { token });
  assert.strictEqual(response.status, 400);
  assert.strictEqual(response.body.code, 'TOKEN_EXPIRED');
});

test('resending a verification link invalidates the previous one', async () => {
  const client = new Client();
  const registered = await client.post('/auth/register', registration());
  const firstToken = tokenFromUrl(registered.body.data.devVerificationUrl);

  const resent = await client.post('/auth/resend-verification', { email: 'flow-user@nexthire.test' });
  assert.strictEqual(resent.status, 200);
  const secondToken = tokenFromUrl(resent.body.data.devVerificationUrl);
  assert.notStrictEqual(firstToken, secondToken);

  // Only the newest link works.
  const stale = await client.post('/auth/verify-email', { token: firstToken });
  assert.strictEqual(stale.status, 400);
  assert.strictEqual(stale.body.code, 'TOKEN_USED');

  const fresh = await client.post('/auth/verify-email', { token: secondToken });
  assert.strictEqual(fresh.status, 200);
});

test('resend-verification does not reveal whether an address is registered', async () => {
  const client = new Client();
  const unknown = await client.post('/auth/resend-verification', { email: 'nobody-here@nexthire.test' });

  assert.strictEqual(unknown.status, 200);
  assert.match(unknown.body.data.message, /if that address needs verification/i);
  assert.ok(!unknown.body.data.devVerificationUrl, 'no link for an account that does not exist');
});

// ===========================================================================
// Login
// ===========================================================================

test('a verified user can sign in and receives an access token plus cookies', async () => {
  const { client, user } = await createVerifiedUser();

  assert.ok(client.accessToken);
  assert.ok(client.refreshToken, 'the refresh token must arrive as a cookie');
  assert.ok(client.csrf, 'a readable CSRF token must accompany it');
  assert.strictEqual(user.email, 'flow-user@nexthire.test');
  assert.strictEqual(user.hasPassword, true);
});

test('the refresh cookie is HttpOnly and the CSRF cookie is not', async () => {
  const client = new Client();
  const data = registration();
  const registered = await client.post('/auth/register', data);
  await client.post('/auth/verify-email', { token: tokenFromUrl(registered.body.data.devVerificationUrl) });

  const response = await client.post('/auth/login', { email: data.email, password: data.password });
  const cookies = response.headers.getSetCookie();

  const refresh = cookies.find((c) => c.startsWith(`${authConfig.cookies.refreshName}=`));
  const csrf = cookies.find((c) => c.startsWith(`${authConfig.cookies.csrfName}=`));

  assert.match(refresh, /HttpOnly/i, 'the refresh token must be unreadable by page scripts');
  assert.ok(!/HttpOnly/i.test(csrf), 'the CSRF token must be readable so it can be echoed back');
  assert.match(refresh, /SameSite=Lax/i);
});

test('the refresh token is stored only as a hash', async () => {
  const { client } = await createVerifiedUser();

  const raw = client.refreshToken;
  const byRaw = await prisma.session.findFirst({ where: { tokenHash: raw } });
  assert.strictEqual(byRaw, null, 'the raw token must not be findable in the database');

  const byHash = await prisma.session.findUnique({ where: { tokenHash: hashToken(raw) } });
  assert.ok(byHash, 'the sha256 of the token is what is stored');
});

test('"remember me" produces a persistent cookie with the long TTL', async () => {
  const shortLived = await createVerifiedUser({}, { rememberMe: false });
  const shortSession = await prisma.session.findUnique({
    where: { tokenHash: hashToken(shortLived.client.refreshToken) },
  });
  assert.strictEqual(shortSession.rememberMe, false);

  await cleanupTestUsers();

  const remembered = await createVerifiedUser({}, { rememberMe: true });
  const longSession = await prisma.session.findUnique({
    where: { tokenHash: hashToken(remembered.client.refreshToken) },
  });
  assert.strictEqual(longSession.rememberMe, true);
  assert.ok(
    longSession.expiresAt.getTime() - shortSession.expiresAt.getTime() > 0,
    'a remembered session must outlive a normal one'
  );
});

test('login records lastLogin and the sign-in appears in the security timeline', async () => {
  const { email } = await createVerifiedUser();

  const stored = await prisma.user.findUnique({ where: { email } });
  assert.ok(stored.lastLogin, 'lastLogin must be recorded');
  assert.ok(stored.lastActive);

  const events = await prisma.authEvent.findMany({ where: { userId: stored.id } });
  const types = events.map((e) => e.type);
  assert.ok(types.includes('REGISTER'));
  assert.ok(types.includes('EMAIL_VERIFIED'));
  assert.ok(types.includes('LOGIN_SUCCESS'));

  const success = events.find((e) => e.type === 'LOGIN_SUCCESS');
  assert.strictEqual(success.provider, 'PASSWORD');
  assert.ok(success.ipAddress, 'the IP address should be captured');
});

test('a wrong password is rejected generically and counts towards the lockout', async () => {
  const { email } = await createVerifiedUser();
  const client = new Client();

  const response = await client.post('/auth/login', { email, password: 'WrongPass123' });
  assert.strictEqual(response.status, 401);
  assert.strictEqual(response.body.code, 'INVALID_CREDENTIALS');
  // AUTH_VERBOSE_LOGIN_ERRORS=false, so the message must not distinguish the failure mode.
  assert.strictEqual(response.body.error, 'Invalid email or password');

  const stored = await prisma.user.findUnique({ where: { email } });
  assert.strictEqual(stored.failedLoginAttempts, 1);
});

test('an unknown email returns the same generic message as a wrong password', async () => {
  const { email } = await createVerifiedUser();
  const client = new Client();

  const wrongPassword = await client.post('/auth/login', { email, password: 'WrongPass123' });
  const unknownEmail = await client.post('/auth/login', {
    email: 'nobody-here@nexthire.test',
    password: 'WrongPass123',
  });

  assert.strictEqual(unknownEmail.status, wrongPassword.status);
  assert.strictEqual(unknownEmail.body.error, wrongPassword.body.error);
  assert.strictEqual(unknownEmail.body.code, wrongPassword.body.code);
});

test('a successful login clears the failed-attempt counter', async () => {
  const { email } = await createVerifiedUser();
  const client = new Client();

  await client.post('/auth/login', { email, password: 'WrongPass123' });
  await client.post('/auth/login', { email, password: 'WrongPass123' });
  assert.strictEqual((await prisma.user.findUnique({ where: { email } })).failedLoginAttempts, 2);

  const success = await client.post('/auth/login', { email, password: VALID_PASSWORD });
  assert.strictEqual(success.status, 200);
  assert.strictEqual((await prisma.user.findUnique({ where: { email } })).failedLoginAttempts, 0);
});

test('the account locks after the configured number of failures', async () => {
  const { email } = await createVerifiedUser({ email: 'flow-locked@nexthire.test', mobile: '+15550004444' });
  const client = new Client();
  const limit = Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS);

  let lastResponse;
  for (let attempt = 0; attempt < limit; attempt += 1) {
    lastResponse = await client.post('/auth/login', { email, password: 'WrongPass123' });
  }

  assert.strictEqual(lastResponse.status, 423);
  assert.strictEqual(lastResponse.body.code, 'ACCOUNT_LOCKED');
  assert.ok(lastResponse.body.retryAfterSec > 0);

  // Even the *correct* password is refused while locked — otherwise the lockout would only
  // slow down an attacker who never guesses right.
  const correct = await client.post('/auth/login', { email, password: VALID_PASSWORD });
  assert.strictEqual(correct.status, 423);
  assert.strictEqual(correct.body.code, 'ACCOUNT_LOCKED');

  const stored = await prisma.user.findUnique({ where: { email } });
  assert.ok(stored.lockedUntil && stored.lockedUntil.getTime() > Date.now());
});

test('a disabled account cannot sign in', async () => {
  const { email } = await createVerifiedUser({ email: 'flow-disabled@nexthire.test', mobile: '+15550005555' });
  await prisma.user.update({
    where: { email },
    data: { isActive: false, disabledReason: 'Policy violation' },
  });

  const client = new Client();
  const response = await client.post('/auth/login', { email, password: VALID_PASSWORD });

  assert.strictEqual(response.status, 403);
  assert.strictEqual(response.body.code, 'ACCOUNT_DISABLED');
  assert.match(response.body.error, /Policy violation/);
});

// ===========================================================================
// Access token & middleware
// ===========================================================================

test('/auth/me returns the caller with their permission list and no secrets', async () => {
  const { client } = await createVerifiedUser();
  const response = await client.get('/auth/me');

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body.data.user.email, 'flow-user@nexthire.test');
  assert.ok(Array.isArray(response.body.data.user.permissions));
  assert.ok(response.body.data.user.permissions.includes('practice:use'));
  assert.ok(!response.body.data.user.permissions.includes('user:manage'));
  assert.ok(!JSON.stringify(response.body).includes('$2a$'));
});

test('a protected endpoint requires a token', async () => {
  const anonymous = new Client();
  const response = await anonymous.get('/auth/me');

  assert.strictEqual(response.status, 401);
  assert.strictEqual(response.body.code, 'TOKEN_MISSING');
});

test('an invalid token is rejected with TOKEN_INVALID', async () => {
  const client = new Client();
  client.accessToken = 'not.a.real.token';

  const response = await client.get('/auth/me');
  assert.strictEqual(response.status, 401);
  assert.strictEqual(response.body.code, 'TOKEN_INVALID');
});

test('an expired token is rejected with TOKEN_EXPIRED so the client knows to refresh', async () => {
  const { user } = await createVerifiedUser();

  const expired = new Client();
  expired.accessToken = jwt.sign(
    { sub: user.id, email: user.email, role: 'USER', tv: 0 },
    authConfig.accessTokenSecret,
    { expiresIn: -60, issuer: authConfig.jwtIssuer, audience: authConfig.jwtAudience }
  );

  const response = await expired.get('/auth/me');
  assert.strictEqual(response.status, 401);
  assert.strictEqual(response.body.code, 'TOKEN_EXPIRED');
});

test('a token whose signature was forged to escalate role is rejected', async () => {
  const { client } = await createVerifiedUser();

  const [header, payload, signature] = client.accessToken.split('.');
  const forgedPayload = Buffer.from(
    JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), role: 'ADMIN' })
  ).toString('base64url');

  const attacker = new Client();
  attacker.accessToken = `${header}.${forgedPayload}.${signature}`;

  const response = await attacker.get('/auth/me');
  assert.strictEqual(response.status, 401);
  assert.strictEqual(response.body.code, 'TOKEN_INVALID');
});

test('a valid token is rejected once the account is disabled, without waiting for expiry', async () => {
  const { client, email } = await createVerifiedUser();
  assert.strictEqual((await client.get('/auth/me')).status, 200);

  await prisma.user.update({ where: { email }, data: { isActive: false } });

  const response = await client.get('/auth/me');
  assert.strictEqual(response.status, 401);
  assert.strictEqual(response.body.code, 'ACCOUNT_DISABLED');
});

test('a valid token is rejected once tokenVersion is bumped', async () => {
  const { client, email } = await createVerifiedUser();
  await prisma.user.update({ where: { email }, data: { tokenVersion: { increment: 1 } } });

  const response = await client.get('/auth/me');
  assert.strictEqual(response.status, 401);
  assert.strictEqual(response.body.code, 'TOKEN_REVOKED');
});

// ===========================================================================
// Refresh & rotation
// ===========================================================================

test('refresh without the CSRF header is refused', async () => {
  const { client } = await createVerifiedUser();

  const response = await client.post('/auth/refresh', {}, { withCsrf: false });
  assert.strictEqual(response.status, 403);
  assert.strictEqual(response.body.code, 'CSRF_FAILED');
});

test('refresh with a mismatched CSRF header is refused', async () => {
  const { client } = await createVerifiedUser();

  const response = await client.post(
    '/auth/refresh',
    {},
    { headers: { [authConfig.csrfHeaderName]: 'not-the-right-token' } }
  );
  assert.strictEqual(response.status, 403);
  assert.strictEqual(response.body.code, 'CSRF_FAILED');
});

test('refresh with no cookie at all reports NO_SESSION', async () => {
  const anonymous = new Client();
  const response = await anonymous.post('/auth/refresh', {}, { withCsrf: true });

  assert.strictEqual(response.status, 401);
  assert.strictEqual(response.body.code, 'NO_SESSION');
});

test('refresh issues a new access token and rotates the refresh cookie', async () => {
  const { client } = await createVerifiedUser();
  const originalAccess = client.accessToken;
  const originalRefresh = client.refreshToken;

  // Ensure the new JWT differs even at one-second `iat` resolution.
  await new Promise((resolve) => setTimeout(resolve, 1100));

  const response = await client.post('/auth/refresh', {}, { withCsrf: true });
  assert.strictEqual(response.status, 200);
  assert.ok(response.body.data.accessToken);
  assert.notStrictEqual(response.body.data.accessToken, originalAccess, 'a fresh access token');
  assert.notStrictEqual(client.refreshToken, originalRefresh, 'the refresh token must rotate');

  // Same session row, updated in place.
  const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(client.refreshToken) } });
  assert.strictEqual(session.id, response.body.data.sessionId);
  assert.strictEqual(session.previousTokenHash, hashToken(originalRefresh));

  // And the new token actually works.
  client.accessToken = response.body.data.accessToken;
  assert.strictEqual((await client.get('/auth/me')).status, 200);
});

test('replaying a rotated refresh token revokes the whole session family', async () => {
  const { client } = await createVerifiedUser();
  const stolen = client.refreshToken;
  const csrf = client.csrf;

  // Legitimate rotation: `stolen` is now the previous token.
  const rotated = await client.post('/auth/refresh', {}, { withCsrf: true });
  assert.strictEqual(rotated.status, 200);

  // An attacker replays the captured token.
  const attacker = new Client();
  attacker.setCookie(authConfig.cookies.refreshName, stolen);
  attacker.setCookie(authConfig.cookies.csrfName, csrf);

  const replay = await attacker.post('/auth/refresh', {}, { withCsrf: true });
  assert.strictEqual(replay.status, 401);
  assert.strictEqual(replay.body.code, 'SESSION_REUSE');

  // The legitimate holder is also logged out — the token was demonstrably copied, so the
  // family can no longer be trusted.
  const victim = await client.post('/auth/refresh', {}, { withCsrf: true });
  assert.strictEqual(victim.status, 401);

  const events = await prisma.authEvent.findMany({ where: { type: 'TOKEN_REUSE_DETECTED' } });
  assert.ok(events.length > 0, 'reuse must be recorded in the security timeline');
});

test('an expired session cannot be refreshed', async () => {
  const { client } = await createVerifiedUser();

  await prisma.session.update({
    where: { tokenHash: hashToken(client.refreshToken) },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  const response = await client.post('/auth/refresh', {}, { withCsrf: true });
  assert.strictEqual(response.status, 401);
  assert.strictEqual(response.body.code, 'SESSION_EXPIRED');
});

test('a session idle past the timeout cannot be refreshed', async () => {
  const { client } = await createVerifiedUser({}, { rememberMe: false });

  // Still within absolute expiry, but untouched for longer than the idle window.
  await prisma.session.update({
    where: { tokenHash: hashToken(client.refreshToken) },
    data: { lastUsedAt: new Date(Date.now() - (authConfig.sessionIdleTimeoutSec + 60) * 1000) },
  });

  const response = await client.post('/auth/refresh', {}, { withCsrf: true });
  assert.strictEqual(response.status, 401);
  assert.strictEqual(response.body.code, 'SESSION_EXPIRED');
});

test('a disabled account cannot refresh even with a valid session', async () => {
  const { client, email } = await createVerifiedUser();
  await prisma.user.update({ where: { email }, data: { isActive: false } });

  const response = await client.post('/auth/refresh', {}, { withCsrf: true });
  assert.strictEqual(response.status, 403);
  assert.strictEqual(response.body.code, 'ACCOUNT_DISABLED');
});

// ===========================================================================
// Logout
// ===========================================================================

test('logout revokes the session and immediately invalidates its access token', async () => {
  const { client } = await createVerifiedUser();
  assert.strictEqual((await client.get('/auth/me')).status, 200);

  const response = await client.post('/auth/logout', {}, { withCsrf: true });
  assert.strictEqual(response.status, 200);
  assert.strictEqual(client.refreshToken, null, 'cookies must be cleared');

  // The access token has not expired, but its session is gone.
  const after = await client.get('/auth/me');
  assert.strictEqual(after.status, 401);
  assert.strictEqual(after.body.code, 'SESSION_REVOKED');
});

test('logout-all signs every device out and kills tokens already in flight', async () => {
  const data = registration();
  const first = await createVerifiedUser();

  // A second device for the same account.
  const second = new Client();
  const secondLogin = await second.post('/auth/login', { email: data.email, password: data.password });
  second.accessToken = secondLogin.body.data.accessToken;

  assert.strictEqual((await first.client.get('/auth/me')).status, 200);
  assert.strictEqual((await second.get('/auth/me')).status, 200);

  const response = await first.client.post('/auth/logout-all', {});
  assert.strictEqual(response.status, 200);
  assert.ok(response.body.data.revokedSessions >= 2);

  // tokenVersion was bumped, so both tokens die at once.
  assert.strictEqual((await first.client.get('/auth/me')).body.code, 'TOKEN_REVOKED');
  assert.strictEqual((await second.get('/auth/me')).body.code, 'TOKEN_REVOKED');
});

test('sessions can be listed and a specific device revoked', async () => {
  const data = registration();
  const first = await createVerifiedUser();

  const second = new Client();
  const secondLogin = await second.post('/auth/login', { email: data.email, password: data.password });
  second.accessToken = secondLogin.body.data.accessToken;

  const list = await first.client.get('/auth/sessions');
  assert.strictEqual(list.status, 200);
  assert.strictEqual(list.body.data.sessions.length, 2);

  const current = list.body.data.sessions.find((s) => s.isCurrent);
  const other = list.body.data.sessions.find((s) => !s.isCurrent);
  assert.ok(current && other, 'exactly one session must be flagged as current');
  // Session records must never carry the token itself.
  assert.ok(!JSON.stringify(list.body).includes(first.client.refreshToken));

  const revoked = await first.client.del(`/auth/sessions/${other.id}`);
  assert.strictEqual(revoked.status, 200);
  assert.strictEqual(revoked.body.data.wasCurrentSession, false);

  // The other device is out; this one is unaffected.
  assert.strictEqual((await second.get('/auth/me')).body.code, 'SESSION_REVOKED');
  assert.strictEqual((await first.client.get('/auth/me')).status, 200);
});

test('a user cannot revoke another user\'s session', async () => {
  const victim = await createVerifiedUser();
  const victimSessions = await victim.client.get('/auth/sessions');
  const victimSessionId = victimSessions.body.data.sessions[0].id;

  const attacker = await createVerifiedUser({
    email: 'flow-second@nexthire.test',
    mobile: '+15550006666',
  });

  const response = await attacker.client.del(`/auth/sessions/${victimSessionId}`);
  assert.strictEqual(response.status, 404, 'must not confirm that the session exists');

  // The victim is still signed in.
  assert.strictEqual((await victim.client.get('/auth/me')).status, 200);
});

// ===========================================================================
// Password reset
// ===========================================================================

test('forgot-password gives an identical response for known and unknown addresses', async () => {
  const { email } = await createVerifiedUser();
  const client = new Client();

  const known = await client.post('/auth/forgot-password', { email });
  const unknown = await client.post('/auth/forgot-password', { email: 'nobody-here@nexthire.test' });

  assert.strictEqual(known.status, unknown.status);
  assert.strictEqual(known.body.data.message, unknown.body.data.message);
  // Only the real account gets a link (dev convenience), but the *message* is identical.
  assert.ok(known.body.data.devResetUrl);
  assert.ok(!unknown.body.data.devResetUrl);
});

test('a reset link sets a new password, works once, and signs every device out', async () => {
  const { client, email } = await createVerifiedUser();

  const requested = await client.post('/auth/forgot-password', { email });
  const token = tokenFromUrl(requested.body.data.devResetUrl);

  const NEW_PASSWORD = 'BrandNewPass9';
  const reset = await client.post('/auth/reset-password', {
    token,
    password: NEW_PASSWORD,
    confirmPassword: NEW_PASSWORD,
  });
  assert.strictEqual(reset.status, 200);

  // Single use.
  const replay = await client.post('/auth/reset-password', {
    token,
    password: NEW_PASSWORD,
    confirmPassword: NEW_PASSWORD,
  });
  assert.strictEqual(replay.status, 400);
  assert.strictEqual(replay.body.code, 'TOKEN_USED');

  // Every session was revoked — a reset is the remedy for a compromise.
  assert.strictEqual((await client.get('/auth/me')).status, 401);

  // The old password no longer works; the new one does.
  const fresh = new Client();
  assert.strictEqual((await fresh.post('/auth/login', { email, password: VALID_PASSWORD })).status, 401);

  const loggedIn = await fresh.post('/auth/login', { email, password: NEW_PASSWORD });
  assert.strictEqual(loggedIn.status, 200);
});

test('a reset link honours the password policy', async () => {
  const { client, email } = await createVerifiedUser();
  const requested = await client.post('/auth/forgot-password', { email });
  const token = tokenFromUrl(requested.body.data.devResetUrl);

  const response = await client.post('/auth/reset-password', {
    token,
    password: 'weak',
    confirmPassword: 'weak',
  });
  assert.strictEqual(response.status, 422);
  assert.ok(response.body.fields.password);
});

test('an expired reset link is rejected', async () => {
  const { client, email } = await createVerifiedUser();
  const requested = await client.post('/auth/forgot-password', { email });
  const token = tokenFromUrl(requested.body.data.devResetUrl);

  await prisma.authToken.update({
    where: { tokenHash: hashToken(token) },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });

  const response = await client.post('/auth/reset-password', {
    token,
    password: 'BrandNewPass9',
    confirmPassword: 'BrandNewPass9',
  });
  assert.strictEqual(response.status, 400);
  assert.strictEqual(response.body.code, 'TOKEN_EXPIRED');
});

test('requesting a second reset link invalidates the first', async () => {
  const { client, email } = await createVerifiedUser();

  const first = await client.post('/auth/forgot-password', { email });
  const second = await client.post('/auth/forgot-password', { email });

  const staleToken = tokenFromUrl(first.body.data.devResetUrl);
  const response = await client.post('/auth/reset-password', {
    token: staleToken,
    password: 'BrandNewPass9',
    confirmPassword: 'BrandNewPass9',
  });
  assert.strictEqual(response.body.code, 'TOKEN_USED');

  const freshToken = tokenFromUrl(second.body.data.devResetUrl);
  const ok = await client.post('/auth/reset-password', {
    token: freshToken,
    password: 'BrandNewPass9',
    confirmPassword: 'BrandNewPass9',
  });
  assert.strictEqual(ok.status, 200);
});

test('an unverified account that completes a reset becomes verified', async () => {
  // Completing an emailed link proves control of the mailbox.
  const client = new Client();
  const data = registration();
  await client.post('/auth/register', data);

  const requested = await client.post('/auth/forgot-password', { email: data.email });
  const token = tokenFromUrl(requested.body.data.devResetUrl);

  await client.post('/auth/reset-password', {
    token,
    password: 'BrandNewPass9',
    confirmPassword: 'BrandNewPass9',
  });

  const stored = await prisma.user.findUnique({ where: { email: data.email } });
  assert.strictEqual(stored.emailVerified, true);

  const loggedIn = await new Client().post('/auth/login', { email: data.email, password: 'BrandNewPass9' });
  assert.strictEqual(loggedIn.status, 200);
});

// ===========================================================================
// Change password
// ===========================================================================

test('change-password requires the current password and keeps this device signed in', async () => {
  const data = registration();
  const first = await createVerifiedUser();

  const second = new Client();
  const secondLogin = await second.post('/auth/login', { email: data.email, password: data.password });
  second.accessToken = secondLogin.body.data.accessToken;

  // Wrong current password is refused as a field error.
  const wrong = await first.client.post('/auth/change-password', {
    currentPassword: 'NotMyPassword1',
    newPassword: 'AnotherPass12',
    confirmPassword: 'AnotherPass12',
  });
  assert.strictEqual(wrong.status, 422);
  assert.match(wrong.body.fields.currentPassword, /incorrect/i);

  const changed = await first.client.post('/auth/change-password', {
    currentPassword: VALID_PASSWORD,
    newPassword: 'AnotherPass12',
    confirmPassword: 'AnotherPass12',
  });
  assert.strictEqual(changed.status, 200);
  assert.ok(changed.body.data.accessToken, 'a replacement token keeps this tab signed in');

  // This device continues to work with the returned token.
  first.client.accessToken = changed.body.data.accessToken;
  assert.strictEqual((await first.client.get('/auth/me')).status, 200);

  // The other device is out.
  assert.strictEqual((await second.get('/auth/me')).status, 401);
});

// ===========================================================================
// Authorization
// ===========================================================================

test('a normal user is refused admin endpoints', async () => {
  const { client } = await createVerifiedUser();

  for (const path of ['/auth/admin/users', '/auth/admin/analytics']) {
    const response = await client.get(path);
    assert.strictEqual(response.status, 403, `${path} must be forbidden`);
    assert.strictEqual(response.body.code, 'FORBIDDEN');
  }
});

test('an admin can list users and read analytics', async () => {
  const { client } = await createVerifiedUser({
    email: 'flow-admin@nexthire.test',
    mobile: '+15550007777',
  });

  const list = await client.get('/auth/admin/users?q=flow-admin');
  assert.strictEqual(list.status, 200);
  assert.ok(Array.isArray(list.body.data.users));
  assert.ok(list.body.data.pagination);
  // Even the admin view must not contain hashes.
  assert.ok(!JSON.stringify(list.body).includes('$2a$'));

  const analytics = await client.get('/auth/admin/analytics');
  assert.strictEqual(analytics.status, 200);
  assert.strictEqual(typeof analytics.body.data.users.total, 'number');
});

test('an admin can disable a user, which ejects them immediately', async () => {
  const admin = await createVerifiedUser({ email: 'flow-admin@nexthire.test', mobile: '+15550007777' });
  const victim = await createVerifiedUser({ email: 'flow-second@nexthire.test', mobile: '+15550008888' });

  assert.strictEqual((await victim.client.get('/auth/me')).status, 200);

  const disabled = await admin.client.patch(`/auth/admin/users/${victim.user.id}/status`, {
    isActive: false,
    reason: 'Suspicious activity',
  });
  assert.strictEqual(disabled.status, 200);
  assert.strictEqual(disabled.body.data.user.isActive, false);

  // The victim's still-valid access token stops working at once.
  const ejected = await victim.client.get('/auth/me');
  assert.strictEqual(ejected.status, 401);
  assert.ok(['ACCOUNT_DISABLED', 'TOKEN_REVOKED'].includes(ejected.body.code));

  // And re-enabling restores access on next sign-in.
  const enabled = await admin.client.patch(`/auth/admin/users/${victim.user.id}/status`, { isActive: true });
  assert.strictEqual(enabled.body.data.user.isActive, true);

  const back = await new Client().post('/auth/login', {
    email: 'flow-second@nexthire.test',
    password: VALID_PASSWORD,
  });
  assert.strictEqual(back.status, 200);
});

test('an admin cannot disable or re-role their own account', async () => {
  const admin = await createVerifiedUser({ email: 'flow-admin@nexthire.test', mobile: '+15550007777' });

  const selfDisable = await admin.client.patch(`/auth/admin/users/${admin.user.id}/status`, { isActive: false });
  assert.strictEqual(selfDisable.status, 400);
  assert.strictEqual(selfDisable.body.code, 'SELF_ACTION');

  const selfRole = await admin.client.patch(`/auth/admin/users/${admin.user.id}/role`, { role: 'USER' });
  assert.strictEqual(selfRole.status, 400);
  assert.strictEqual(selfRole.body.code, 'SELF_ACTION');
});

test('an admin can change a user role, which revokes their sessions', async () => {
  const admin = await createVerifiedUser({ email: 'flow-admin@nexthire.test', mobile: '+15550007777' });
  const target = await createVerifiedUser({ email: 'flow-second@nexthire.test', mobile: '+15550008888' });

  const changed = await admin.client.patch(`/auth/admin/users/${target.user.id}/role`, { role: 'INTERVIEWER' });
  assert.strictEqual(changed.status, 200);
  assert.strictEqual(changed.body.data.user.role, 'INTERVIEWER');

  // Access tokens carry the role, so the old one must stop working.
  assert.strictEqual((await target.client.get('/auth/me')).status, 401);

  // On the next sign-in the new role — and its extra capability — is in effect.
  const relogin = new Client();
  const loggedIn = await relogin.post('/auth/login', {
    email: 'flow-second@nexthire.test',
    password: VALID_PASSWORD,
  });
  assert.strictEqual(loggedIn.body.data.user.role, 'INTERVIEWER');
  assert.ok(loggedIn.body.data.user.permissions.includes('interview:host'));
  assert.ok(!loggedIn.body.data.user.permissions.includes('user:manage'));
});

test('ADMIN cannot be granted through the API — it comes from configuration', async () => {
  const admin = await createVerifiedUser({ email: 'flow-admin@nexthire.test', mobile: '+15550007777' });
  const target = await createVerifiedUser({ email: 'flow-second@nexthire.test', mobile: '+15550008888' });

  const response = await admin.client.patch(`/auth/admin/users/${target.user.id}/role`, { role: 'ADMIN' });
  assert.strictEqual(response.status, 409);
  assert.strictEqual(response.body.code, 'ADMIN_BY_CONFIG');

  const stored = await prisma.user.findUnique({ where: { id: target.user.id } });
  assert.strictEqual(stored.role, 'USER');
});

test('a configured admin cannot be demoted, because login would restore the role', async () => {
  const configuredAdmin = await createVerifiedUser({
    email: 'flow-admin@nexthire.test',
    mobile: '+15550007777',
  });

  // A second ADMIN is needed to attempt the demotion (an admin cannot act on themselves).
  // It is promoted directly in the database and handed a matching token, because signing in
  // would run reconcileRole and demote it — this account is not on the configured list.
  const other = await createVerifiedUser({ email: 'flow-second@nexthire.test', mobile: '+15550008888' });
  await prisma.user.update({ where: { id: other.user.id }, data: { role: 'ADMIN' } });
  other.client.accessToken = jwt.sign(
    { sub: other.user.id, email: other.user.email, role: 'ADMIN', tv: 0 },
    authConfig.accessTokenSecret,
    { expiresIn: 300, issuer: authConfig.jwtIssuer, audience: authConfig.jwtAudience }
  );

  const response = await other.client.patch(`/auth/admin/users/${configuredAdmin.user.id}/role`, {
    role: 'USER',
  });
  assert.strictEqual(response.status, 409);
  assert.strictEqual(response.body.code, 'PROTECTED_ADMIN');

  // The role is unchanged in the database.
  const stored = await prisma.user.findUnique({ where: { id: configuredAdmin.user.id } });
  assert.strictEqual(stored.role, 'ADMIN');
});

test('an admin cannot disable a configured administrator', async () => {
  const admin = await createVerifiedUser({ email: 'flow-admin@nexthire.test', mobile: '+15550007777' });

  // A second account promoted to ADMIN in the database (not on the configured list) is used
  // to attempt the action against the configured admin.
  const other = await createVerifiedUser({ email: 'flow-second@nexthire.test', mobile: '+15550008888' });
  await prisma.user.update({ where: { id: other.user.id }, data: { role: 'ADMIN' } });
  // Re-issue a token carrying the new role without going through login (which would demote).
  const promotedToken = jwt.sign(
    { sub: other.user.id, email: other.user.email, role: 'ADMIN', tv: 0, sid: null },
    authConfig.accessTokenSecret,
    { expiresIn: 300, issuer: authConfig.jwtIssuer, audience: authConfig.jwtAudience }
  );
  other.client.accessToken = promotedToken;

  const response = await other.client.patch(`/auth/admin/users/${admin.user.id}/status`, { isActive: false });
  assert.strictEqual(response.status, 409);
  assert.strictEqual(response.body.code, 'PROTECTED_ADMIN');
});

test('an admin can clear a lockout and revoke a user\'s sessions', async () => {
  const admin = await createVerifiedUser({ email: 'flow-admin@nexthire.test', mobile: '+15550007777' });
  const target = await createVerifiedUser({ email: 'flow-second@nexthire.test', mobile: '+15550008888' });

  await prisma.user.update({
    where: { id: target.user.id },
    data: { failedLoginAttempts: 9, lockedUntil: new Date(Date.now() + 600_000) },
  });

  const unlocked = await admin.client.post(`/auth/admin/users/${target.user.id}/unlock`, {});
  assert.strictEqual(unlocked.status, 200);
  assert.strictEqual(unlocked.body.data.user.isLocked, false);

  const revoked = await admin.client.post(`/auth/admin/users/${target.user.id}/revoke-sessions`, {});
  assert.strictEqual(revoked.status, 200);
  assert.ok(revoked.body.data.revokedSessions >= 1);
  assert.strictEqual((await target.client.get('/auth/me')).status, 401);
});

test('an admin-initiated reset emails a link rather than setting a password', async () => {
  const admin = await createVerifiedUser({ email: 'flow-admin@nexthire.test', mobile: '+15550007777' });
  const target = await createVerifiedUser({ email: 'flow-second@nexthire.test', mobile: '+15550008888' });

  const response = await admin.client.post(`/auth/admin/users/${target.user.id}/reset-password`, {});
  assert.strictEqual(response.status, 200);
  assert.ok(response.body.data.devResetUrl, 'a reset link is generated for the user');

  // The user's sessions were revoked as part of the action.
  assert.strictEqual((await target.client.get('/auth/me')).status, 401);

  // And the old password still works until the *user* completes the reset — the admin never
  // gets to set or learn a credential.
  const stillWorks = await new Client().post('/auth/login', {
    email: 'flow-second@nexthire.test',
    password: VALID_PASSWORD,
  });
  assert.strictEqual(stillWorks.status, 200);
});

// ===========================================================================
// Route protection across the rest of the API
// ===========================================================================

test('business endpoints reject anonymous callers', async () => {
  const anonymous = new Client();

  for (const path of ['/library/progress', '/library/progress/stats', '/library/notes/some-id']) {
    const response = await anonymous.get(path);
    assert.strictEqual(response.status, 401, `${path} must require authentication`);
    assert.strictEqual(response.body.code, 'TOKEN_MISSING');
  }
});

test('business endpoints accept an authenticated caller with the right permission', async () => {
  const { client } = await createVerifiedUser();

  const response = await client.get('/library/progress/stats');
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body.success, true);
});

test('public browse endpoints still work anonymously', async () => {
  const anonymous = new Client();
  const response = await anonymous.get('/library/collections/topics');

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body.success, true);
});

// ===========================================================================
// Google OAuth surface
// ===========================================================================

test('the auth config endpoint reports Google availability and the password policy', async () => {
  const anonymous = new Client();
  const response = await anonymous.get('/auth/config');

  assert.strictEqual(response.status, 200);
  assert.strictEqual(typeof response.body.data.googleEnabled, 'boolean');
  assert.strictEqual(response.body.data.passwordPolicy.minLength, 8);
  assert.strictEqual(response.body.data.passwordPolicy.requiresUppercase, true);
  // A client secret must never be published.
  assert.ok(!JSON.stringify(response.body).toLowerCase().includes('client_secret'));
  assert.ok(!('googleClientSecret' in response.body.data));
});

test('a forged Google credential is rejected — the ID token is verified server-side', async () => {
  const anonymous = new Client();

  // Self-signed token claiming to be an admin's Google identity. Without real verification
  // against Google's keys this would be a complete account takeover.
  const forged = jwt.sign(
    {
      iss: 'https://accounts.google.com',
      sub: 'attacker-controlled-sub',
      email: 'flow-admin@nexthire.test',
      email_verified: true,
      name: 'Attacker',
      aud: 'anything',
    },
    'attacker-chosen-secret',
    { expiresIn: 600 }
  );

  const response = await anonymous.post('/auth/google', { credential: forged });
  assert.ok([401, 503].includes(response.status), `expected rejection, got ${response.status}`);
  assert.notStrictEqual(response.body.success, true);
  assert.ok(!response.body.data?.accessToken, 'no session may be created from a forged token');

  // And no account was created for the claimed address.
  const created = await prisma.user.findUnique({ where: { email: 'flow-admin@nexthire.test' } });
  assert.strictEqual(created, null);
});

test('the Google authorization-code flow reports when it is not configured', async () => {
  const anonymous = new Client();
  const response = await anonymous.get('/auth/google/start');

  if (authConfig.google.supportsCodeFlow) {
    // Configured: expect a redirect to Google (fetch follows it, so just assert no 5xx).
    assert.ok(response.status < 500);
  } else {
    assert.strictEqual(response.status, 503);
    assert.strictEqual(response.body.code, 'GOOGLE_NOT_CONFIGURED');
  }
});

// ===========================================================================
// Profile
// ===========================================================================

test('a user can update their own profile', async () => {
  const { client } = await createVerifiedUser();

  const response = await client.patch('/auth/profile', {
    name: 'Renamed User',
    mobile: '+15559998888',
    bio: 'Preparing for interviews.',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body.data.user.name, 'Renamed User');
  assert.strictEqual(response.body.data.user.mobile, '+15559998888');
  // Changing the number resets its verification.
  assert.strictEqual(response.body.data.user.mobileVerified, false);
  assert.strictEqual(response.body.data.user.profile.bio, 'Preparing for interviews.');
});

test('a profile update cannot take a mobile number already in use', async () => {
  const first = await createVerifiedUser();
  const second = await createVerifiedUser({ email: 'flow-second@nexthire.test', mobile: '+15550006666' });

  const response = await second.client.patch('/auth/profile', { mobile: first.user.mobile });
  assert.strictEqual(response.status, 409);
  assert.match(response.body.fields.mobile, /already exists/i);
});

test('a profile update cannot change role, email or verification state', async () => {
  const { client } = await createVerifiedUser();

  const response = await client.patch('/auth/profile', {
    name: 'Still Me',
    role: 'ADMIN',
    email: 'hacker@nexthire.test',
    emailVerified: true,
    isActive: true,
    tokenVersion: 99,
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body.data.user.role, 'USER');
  assert.strictEqual(response.body.data.user.email, 'flow-user@nexthire.test');

  const stored = await prisma.user.findUnique({ where: { email: 'flow-user@nexthire.test' } });
  assert.strictEqual(stored.role, 'USER');
  assert.strictEqual(stored.tokenVersion, 0);
});

test('unlinking Google is refused when it would leave no way to sign in', async () => {
  const { client, email } = await createVerifiedUser();

  // Simulate a Google-only account: linked, no password.
  await prisma.user.update({
    where: { email },
    data: { googleId: 'google-test-sub-1', passwordHash: null },
  });

  const response = await client.post('/auth/google/unlink', {});
  assert.strictEqual(response.status, 409);
  assert.strictEqual(response.body.code, 'LAST_LOGIN_METHOD');
});

test('the security timeline is scoped to the calling user', async () => {
  const first = await createVerifiedUser();
  const second = await createVerifiedUser({ email: 'flow-second@nexthire.test', mobile: '+15550006666' });

  const events = await second.client.get('/auth/security-events');
  assert.strictEqual(events.status, 200);
  assert.ok(events.body.data.events.length > 0);

  // No trace of the other account.
  assert.ok(!JSON.stringify(events.body).includes(first.user.id));
  assert.ok(!JSON.stringify(events.body).includes('flow-user@nexthire.test'));
});
