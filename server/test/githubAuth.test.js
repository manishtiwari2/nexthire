// End-to-end GitHub OAuth tests.
//
// The real Express router, middleware, Prisma client and Postgres are all exercised over
// real HTTP on an ephemeral port — the only thing standing in for a live service is GitHub
// itself, which is replaced by a local stub implementing the three endpoints the flow uses
// (`/login/oauth/access_token`, `/user`, `/user/emails`). Everything under test — state
// handling, the code exchange, email-verification enforcement, account linking, session
// issuance, unlink safety — is the shipped code.
//
// Environment is configured before any application module is required, because authConfig
// snapshots process.env at load time.

process.env.DISABLE_RATE_LIMIT = '1'; // otherwise the suite would be order-dependent
process.env.ADMIN_EMAILS = 'gh-admin@nexthire.test';
process.env.EMAIL_VERIFICATION_REQUIRED = 'true';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.GITHUB_CLIENT_ID = 'test-github-client-id';
process.env.GITHUB_CLIENT_SECRET = 'test-github-client-secret';
process.env.GITHUB_REDIRECT_URI = 'http://127.0.0.1:5000/api/v1/auth/github/callback';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const express = require('express');
const cookieParser = require('cookie-parser');

const { prisma } = require('../src/shared/db');
const authRoutes = require('../src/features/auth/authRoutes');
const { authConfig } = require('../src/features/auth/authConfig');
const { hashPassword } = require('../src/features/auth/passwordService');
const { selectVerifiedEmail } = require('../src/features/auth/githubService');
const { remainingLoginMethods } = require('../src/features/auth/authController');

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const TEST_EMAILS = [
  'gh-new@nexthire.test',
  'gh-admin@nexthire.test',
  'gh-existing@nexthire.test',
  'gh-disabled@nexthire.test',
  'gh-unverified@nexthire.test',
  'gh-private@nexthire.test',
];

let server;
let baseUrl;
let githubStub;
let originalConsoleLog;

/**
 * What the GitHub stub will answer with next. Each test sets the shape it needs; `reset()`
 * returns it to a plain, valid, verified account.
 */
const stub = {
  exchange: null,
  user: null,
  emails: null,
  reset() {
    this.exchange = { access_token: 'gho_test_token', scope: 'read:user,user:email' };
    this.user = {
      id: 90210,
      login: 'octotester',
      name: 'Octo Tester',
      avatar_url: 'https://avatars.githubusercontent.com/u/90210',
      html_url: 'https://github.com/octotester',
      email: null, // private profile email: the flow must not depend on this field
    };
    this.emails = [
      { email: 'gh-secondary@nexthire.test', primary: false, verified: true },
      { email: 'gh-new@nexthire.test', primary: true, verified: true },
    ];
  },
};

before(async () => {
  originalConsoleLog = console.log;
  console.log = () => {};

  // --- the stand-in for github.com -----------------------------------------
  githubStub = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    if (req.method === 'POST' && url.pathname === '/login/oauth/access_token') {
      // GitHub answers a rejected code with HTTP *200* and an `error` field, so the stub
      // does too — that quirk is exactly what the service has to cope with.
      return send(200, stub.exchange);
    }
    if (req.method === 'GET' && url.pathname === '/user') {
      if (stub.user === null) return send(401, { message: 'Bad credentials' });
      return send(200, stub.user);
    }
    if (req.method === 'GET' && url.pathname === '/user/emails') {
      if (stub.emails === null) return send(403, { message: 'Missing user:email scope' });
      return send(200, stub.emails);
    }
    return send(404, { message: 'Not Found' });
  });
  await new Promise((resolve) => githubStub.listen(0, '127.0.0.1', resolve));
  const stubBase = `http://127.0.0.1:${githubStub.address().port}`;

  // githubService reads these at call time, so pointing them at the stub is enough.
  authConfig.github.oauthBaseUrl = stubBase;
  authConfig.github.apiBaseUrl = stubBase;

  // --- the app under test ---------------------------------------------------
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/v1/auth', authRoutes);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/v1`;

  await cleanupTestUsers();
});

after(async () => {
  console.log = originalConsoleLog;
  await cleanupTestUsers();
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => githubStub.close(resolve));
  await prisma.$disconnect();
});

beforeEach(async () => {
  stub.reset();
  await cleanupTestUsers();
});

async function cleanupTestUsers() {
  // Sessions, auth tokens, events and the profile all cascade from User.
  await prisma.user.deleteMany({ where: { email: { in: TEST_EMAILS } } });
  await prisma.user.deleteMany({ where: { githubId: { in: ['90210', '55555'] } } });
}

/** Parse a Set-Cookie list into a name -> value map, ignoring attributes. */
function parseCookies(setCookieHeaders) {
  const jar = new Map();
  for (const raw of setCookieHeaders) {
    const [pair] = raw.split(';');
    const index = pair.indexOf('=');
    if (index === -1) continue;
    jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
  return jar;
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

/**
 * Read the handshake cookie's JSON payload. Express percent-encodes the value on the way
 * out (cookie-parser decodes it again on the way in), so a raw Set-Cookie read has to undo
 * that itself.
 */
function readHandshake(jar) {
  const raw = jar.get('nh_oauth');
  return raw ? JSON.parse(decodeURIComponent(raw)) : null;
}

/**
 * Run `GET /auth/github/start` and return the redirect target plus the handshake cookie.
 * `redirect: 'manual'` throughout: these endpoints *are* redirects, so following them would
 * hide the thing being asserted (and chase the SPA URL, which is not served here).
 */
async function startFlow(query = '') {
  const response = await fetch(`${baseUrl}/auth/github/start${query}`, { redirect: 'manual' });
  const jar = parseCookies(response.headers.getSetCookie());
  const location = response.headers.get('location') || '';
  const state = location ? new URL(location).searchParams.get('state') : null;
  return { response, jar, location, state };
}

/** Run the callback with an explicit state/cookie pairing. */
async function callback({ code = 'valid-code', state, jar }) {
  const params = new URLSearchParams();
  if (code !== null) params.set('code', code);
  if (state !== null && state !== undefined) params.set('state', state);

  return fetch(`${baseUrl}/auth/github/callback?${params.toString()}`, {
    redirect: 'manual',
    headers: jar ? { cookie: cookieHeader(jar) } : {},
  });
}

/** The whole happy path: start, then call back with the matching state. */
async function signInWithGithub(query = '') {
  const { jar, state } = await startFlow(query);
  const response = await callback({ state, jar });
  const location = response.headers.get('location') || '';
  const fragment = new URLSearchParams(location.split('#')[1] || '');
  return {
    response,
    location,
    fragment,
    cookies: parseCookies(response.headers.getSetCookie()),
    accessToken: fragment.get('access_token'),
  };
}

/** Read the error code out of a `/login?error=…` redirect. */
function errorCodeFrom(response) {
  const location = response.headers.get('location') || '';
  return new URL(location, 'http://placeholder').searchParams.get('error');
}

// ===========================================================================
// Discovery
// ===========================================================================

test('GET /auth/config advertises GitHub without leaking the client secret', async () => {
  const response = await fetch(`${baseUrl}/auth/config`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.githubEnabled, true);
  // GitHub has no browser-side flow, so nothing about the OAuth app should be published.
  assert.equal(body.data.githubClientId, undefined);
  assert.ok(!JSON.stringify(body).includes('test-github-client-secret'));
  // The existing providers must still be described.
  assert.equal(typeof body.data.googleEnabled, 'boolean');
  assert.equal(typeof body.data.passwordPolicy.minLength, 'number');
});

// ===========================================================================
// Handshake
// ===========================================================================

test('GET /auth/github/start redirects to GitHub and sets a provider-tagged state cookie', async () => {
  const { response, jar, location, state } = await startFlow('?redirect=/library&remember=true');

  assert.equal(response.status, 302);

  const target = new URL(location);
  assert.equal(target.origin, authConfig.github.oauthBaseUrl);
  assert.equal(target.pathname, '/login/oauth/authorize');
  assert.equal(target.searchParams.get('client_id'), 'test-github-client-id');
  assert.equal(target.searchParams.get('redirect_uri'), authConfig.github.redirectUri);
  assert.equal(target.searchParams.get('scope'), 'read:user user:email');
  assert.ok(state && state.length >= 16, 'state should be long enough to be unguessable');
  // The secret must never appear in a URL the browser is sent to.
  assert.ok(!location.includes('test-github-client-secret'));

  const handshake = readHandshake(jar);
  assert.equal(handshake.provider, 'github');
  assert.equal(handshake.state, state);
  assert.equal(handshake.redirect, '/library');
  assert.equal(handshake.rememberMe, true);
  // GitHub issues no ID token, so there is nothing for a nonce to protect.
  assert.equal(handshake.nonce, undefined);
});

test('GET /auth/github/start refuses an off-site redirect target', async () => {
  const { jar } = await startFlow('?redirect=https://evil.example/steal');
  assert.equal(readHandshake(jar).redirect, '/dashboard');

  const { jar: protocolRelative } = await startFlow('?redirect=//evil.example');
  assert.equal(readHandshake(protocolRelative).redirect, '/dashboard');
});

// ===========================================================================
// Sign-up, sign-in, linking
// ===========================================================================

test('first GitHub sign-in creates a verified account and a GITHUB session', async () => {
  const { response, location, fragment, cookies } = await signInWithGithub('?redirect=/library');

  assert.equal(response.status, 302);
  assert.ok(location.startsWith(`${authConfig.clientUrl}/auth/callback#`), location);
  assert.ok(fragment.get('access_token'), 'access token should be handed back in the fragment');
  assert.equal(fragment.get('provider'), 'GITHUB');
  assert.equal(fragment.get('new_account'), '1');
  assert.equal(fragment.get('redirect'), '/library');
  // The token must ride in the fragment, never the query string, or it lands in access logs.
  assert.ok(!location.split('#')[0].includes('access_token'));

  // The session cookie is what actually persists the login.
  assert.ok(cookies.get(authConfig.cookies.refreshName), 'refresh cookie should be set');
  assert.ok(cookies.get(authConfig.cookies.csrfName), 'csrf cookie should be set');

  const user = await prisma.user.findUnique({
    where: { email: 'gh-new@nexthire.test' },
    include: { profile: true, sessions: true },
  });
  assert.ok(user, 'the account should exist');
  assert.equal(user.githubId, '90210');
  assert.equal(user.name, 'Octo Tester');
  assert.equal(user.role, 'USER');
  // GitHub verified the address, so there is nothing left for us to verify.
  assert.equal(user.emailVerified, true);
  assert.ok(user.emailVerifiedAt);
  // No password was set, and none should have been invented.
  assert.equal(user.passwordHash, null);
  assert.equal(user.sessions.length, 1);
  assert.equal(user.sessions[0].provider, 'GITHUB');
  // GitHub told us the profile URL, so Profile.githubUrl should be populated.
  assert.equal(user.profile.githubUrl, 'https://github.com/octotester');

  const events = await prisma.authEvent.findMany({ where: { userId: user.id } });
  const types = events.map((event) => event.type);
  assert.ok(types.includes('REGISTER'));
  assert.ok(types.includes('LOGIN_SUCCESS'));
  assert.ok(events.every((event) => ['GITHUB', null].includes(event.provider)));
});

test('the issued access token authenticates /auth/me and reports githubLinked', async () => {
  const { accessToken } = await signInWithGithub();

  const response = await fetch(`${baseUrl}/auth/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.user.email, 'gh-new@nexthire.test');
  assert.equal(body.data.user.githubLinked, true);
  assert.equal(body.data.user.googleLinked, false);
  assert.equal(body.data.user.hasPassword, false);
  assert.equal(body.data.user.emailVerified, true);
  // The DTO allow-list must not leak credentials.
  assert.equal(body.data.user.githubId, undefined);
  assert.equal(body.data.user.passwordHash, undefined);
});

test('signing in again reuses the same account instead of duplicating it', async () => {
  await signInWithGithub();
  const second = await signInWithGithub();

  // `new_account` is absent the second time round.
  assert.equal(second.fragment.get('new_account'), null);

  const users = await prisma.user.findMany({ where: { githubId: '90210' } });
  assert.equal(users.length, 1);
  assert.equal(users[0].email, 'gh-new@nexthire.test');
});

test('GitHub links onto an existing password account with the same verified email', async () => {
  const existing = await prisma.user.create({
    data: {
      email: 'gh-existing@nexthire.test',
      name: 'Chosen Name',
      passwordHash: await hashPassword('CorrectHorse9'),
      passwordChangedAt: new Date(),
      avatarUrl: 'https://example.test/my-own-avatar.png',
      emailVerified: false, // never confirmed the emailed link
      isVerified: false,
    },
  });
  stub.emails = [{ email: 'gh-existing@nexthire.test', primary: true, verified: true }];

  await signInWithGithub();

  const linked = await prisma.user.findUnique({ where: { id: existing.id } });
  assert.equal(linked.githubId, '90210');
  // The password still works; linking must not remove a sign-in method.
  assert.equal(linked.passwordHash, existing.passwordHash);
  // A verified provider identity settles an unconfirmed email address.
  assert.equal(linked.emailVerified, true);
  // Fields the user chose themselves are not overwritten by GitHub's versions.
  assert.equal(linked.name, 'Chosen Name');
  assert.equal(linked.avatarUrl, 'https://example.test/my-own-avatar.png');

  // Exactly one account, and the link is audited.
  assert.equal((await prisma.user.count({ where: { email: 'gh-existing@nexthire.test' } })), 1);
  const linkEvent = await prisma.authEvent.findFirst({
    where: { userId: existing.id, type: 'GITHUB_LINKED' },
  });
  assert.ok(linkEvent, 'the link should be recorded on the security timeline');
  assert.equal(linkEvent.provider, 'GITHUB');
});

test('the admin allow-list is applied to GitHub sign-ups, not taken from GitHub', async () => {
  stub.emails = [{ email: 'gh-admin@nexthire.test', primary: true, verified: true }];

  await signInWithGithub();

  const user = await prisma.user.findUnique({ where: { email: 'gh-admin@nexthire.test' } });
  assert.equal(user.role, 'ADMIN');
});

// ===========================================================================
// Email-verification enforcement — the account-takeover guard
// ===========================================================================

test('an unverified GitHub email is refused and creates no account', async () => {
  stub.emails = [{ email: 'gh-unverified@nexthire.test', primary: true, verified: false }];

  const { response } = await signInWithGithub();

  assert.equal(errorCodeFrom(response), 'GITHUB_EMAIL_UNVERIFIED');
  assert.equal(await prisma.user.count({ where: { email: 'gh-unverified@nexthire.test' } }), 0);
  assert.equal(await prisma.user.count({ where: { githubId: '90210' } }), 0);
});

test('an unverified GitHub email cannot claim an existing account', async () => {
  // The attack: register a GitHub account carrying someone else's address, unverified.
  const victim = await prisma.user.create({
    data: {
      email: 'gh-existing@nexthire.test',
      name: 'Victim',
      passwordHash: await hashPassword('CorrectHorse9'),
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });
  stub.emails = [{ email: 'gh-existing@nexthire.test', primary: true, verified: false }];

  const { response } = await signInWithGithub();

  assert.equal(errorCodeFrom(response), 'GITHUB_EMAIL_UNVERIFIED');
  const untouched = await prisma.user.findUnique({ where: { id: victim.id } });
  assert.equal(untouched.githubId, null, 'the victim account must not have been linked');
});

test("the profile's unverified public email is never used as a fallback", async () => {
  // `/user`.email carries no verification status, so it must not stand in for the list.
  stub.user = { ...stub.user, email: 'gh-private@nexthire.test' };
  stub.emails = [{ email: 'gh-private@nexthire.test', primary: true, verified: false }];

  const { response } = await signInWithGithub();

  assert.equal(errorCodeFrom(response), 'GITHUB_EMAIL_UNVERIFIED');
  assert.equal(await prisma.user.count({ where: { email: 'gh-private@nexthire.test' } }), 0);
});

test('a missing user:email scope fails closed rather than trusting the profile email', async () => {
  stub.user = { ...stub.user, email: 'gh-private@nexthire.test' };
  stub.emails = null; // the stub answers 403, as GitHub does without the scope

  const { response } = await signInWithGithub();

  assert.equal(errorCodeFrom(response), 'GITHUB_EMAIL_SCOPE_MISSING');
  assert.equal(await prisma.user.count({ where: { email: 'gh-private@nexthire.test' } }), 0);
});

test('the primary verified address wins over other verified ones', async () => {
  stub.emails = [
    { email: 'gh-secondary@nexthire.test', primary: false, verified: true },
    { email: 'gh-new@nexthire.test', primary: true, verified: true },
  ];

  await signInWithGithub();

  assert.equal(await prisma.user.count({ where: { email: 'gh-new@nexthire.test' } }), 1);
  assert.equal(await prisma.user.count({ where: { email: 'gh-secondary@nexthire.test' } }), 0);
});

test('selectVerifiedEmail prefers primary, accepts any verified, and never guesses', () => {
  assert.equal(
    selectVerifiedEmail([
      { email: 'a@x.test', primary: false, verified: true },
      { email: 'B@X.test', primary: true, verified: true },
    ]),
    'b@x.test',
    'the primary address wins, normalised to lower case'
  );
  assert.equal(
    selectVerifiedEmail([
      { email: 'unverified@x.test', primary: true, verified: false },
      { email: 'verified@x.test', primary: false, verified: true },
    ]),
    'verified@x.test',
    'an unverified primary is skipped in favour of a verified secondary'
  );
  assert.equal(
    selectVerifiedEmail([{ email: 'only@x.test', primary: true, verified: false }]),
    null,
    'an unverified address is never accepted, even as the only candidate'
  );
  assert.equal(selectVerifiedEmail([]), null);
  assert.equal(selectVerifiedEmail(null), null);
  assert.equal(selectVerifiedEmail(undefined), null);
});

// ===========================================================================
// State / CSRF
// ===========================================================================

test('a callback with no handshake cookie is refused', async () => {
  const response = await callback({ state: 'some-state', jar: null });
  assert.equal(errorCodeFrom(response), 'OAUTH_STATE_MISSING');
  assert.equal(await prisma.user.count({ where: { githubId: '90210' } }), 0);
});

test('a callback whose state does not match the cookie is refused', async () => {
  const { jar } = await startFlow();
  const response = await callback({ state: 'attacker-chosen-state', jar });

  assert.equal(errorCodeFrom(response), 'OAUTH_STATE_MISMATCH');
  assert.equal(await prisma.user.count({ where: { githubId: '90210' } }), 0);
});

test('a callback with no state at all is refused', async () => {
  const { jar } = await startFlow();
  const response = await callback({ state: null, jar });
  assert.equal(errorCodeFrom(response), 'OAUTH_STATE_MISMATCH');
});

test('a Google handshake cannot be completed at the GitHub callback', async () => {
  // Same cookie name, valid state, wrong provider — without the provider tag this would
  // sail through, letting one provider's handshake be redeemed as the other's.
  const google = await fetch(`${baseUrl}/auth/google/start`, { redirect: 'manual' });
  const jar = parseCookies(google.headers.getSetCookie());
  const handshake = readHandshake(jar) || {};
  assert.equal(handshake.provider, 'google', 'precondition: a Google handshake was issued');

  const response = await callback({ state: handshake.state, jar });

  assert.equal(errorCodeFrom(response), 'OAUTH_PROVIDER_MISMATCH');
  assert.equal(await prisma.user.count({ where: { githubId: '90210' } }), 0);
});

test('a handshake cookie predating the provider tag is refused rather than trusted', async () => {
  const jar = new Map([['nh_oauth', JSON.stringify({ state: 'legacy-state', redirect: '/dashboard' })]]);
  const response = await callback({ state: 'legacy-state', jar });
  assert.equal(errorCodeFrom(response), 'OAUTH_PROVIDER_MISMATCH');
});

test('the handshake cookie is cleared on both success and failure', async () => {
  const { jar, state } = await startFlow();
  const success = await callback({ state, jar });
  assert.ok(
    success.headers.getSetCookie().some((c) => c.startsWith('nh_oauth=') && /Expires=|Max-Age=0/i.test(c)),
    'the one-shot handshake cookie should not survive a successful sign-in'
  );

  const { jar: jar2 } = await startFlow();
  const failure = await callback({ state: 'wrong', jar: jar2 });
  assert.ok(
    failure.headers.getSetCookie().some((c) => c.startsWith('nh_oauth=') && /Expires=|Max-Age=0/i.test(c)),
    'a failed attempt should not leave a reusable handshake behind'
  );
});

// ===========================================================================
// Provider and account failures
// ===========================================================================

test('cancelling on GitHub returns the user to /login, not an error page', async () => {
  const { jar, state } = await startFlow();
  const response = await fetch(
    `${baseUrl}/auth/github/callback?error=access_denied&error_description=The+user+denied+access&state=${state}`,
    { redirect: 'manual', headers: { cookie: cookieHeader(jar) } }
  );

  assert.equal(response.status, 302);
  assert.ok((response.headers.get('location') || '').startsWith(`${authConfig.clientUrl}/login?`));
  assert.equal(errorCodeFrom(response), 'GITHUB_DENIED');
});

test('a rejected authorization code is caught despite GitHub answering HTTP 200', async () => {
  stub.exchange = { error: 'bad_verification_code', error_description: 'The code is incorrect or expired.' };

  const { response } = await signInWithGithub();

  assert.equal(errorCodeFrom(response), 'GITHUB_EXCHANGE_FAILED');
  assert.equal(await prisma.user.count({ where: { githubId: '90210' } }), 0);
});

test('a callback with no code is refused', async () => {
  const { jar, state } = await startFlow();
  const response = await callback({ code: null, state, jar });
  assert.equal(errorCodeFrom(response), 'GITHUB_NO_CODE');
});

test('an access token GitHub will not honour is reported, not ignored', async () => {
  stub.user = null; // the stub answers 401 Bad credentials

  const { response } = await signInWithGithub();
  assert.equal(errorCodeFrom(response), 'GITHUB_PROFILE_FAILED');
});

test('a disabled account cannot be revived through GitHub', async () => {
  const disabled = await prisma.user.create({
    data: {
      email: 'gh-disabled@nexthire.test',
      name: 'Disabled',
      githubId: '90210',
      isActive: false,
      disabledReason: 'abuse',
      emailVerified: true,
    },
  });
  stub.emails = [{ email: 'gh-disabled@nexthire.test', primary: true, verified: true }];

  const { response, cookies } = await signInWithGithub();

  assert.equal(errorCodeFrom(response), 'ACCOUNT_DISABLED');
  assert.ok(!cookies.get(authConfig.cookies.refreshName), 'no session may be issued');
  assert.equal(await prisma.session.count({ where: { userId: disabled.id } }), 0);
  const still = await prisma.user.findUnique({ where: { id: disabled.id } });
  assert.equal(still.isActive, false);
});

// ===========================================================================
// Unlinking
// ===========================================================================

test('unlinking GitHub is refused when it is the only way to sign in', async () => {
  const { accessToken } = await signInWithGithub();

  const response = await fetch(`${baseUrl}/auth/github/unlink`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json();

  assert.equal(response.status, 409);
  assert.equal(body.code, 'LAST_LOGIN_METHOD');

  const user = await prisma.user.findUnique({ where: { email: 'gh-new@nexthire.test' } });
  assert.equal(user.githubId, '90210', 'the link must survive a refused unlink');
});

test('unlinking GitHub succeeds once another sign-in method exists', async () => {
  const { accessToken } = await signInWithGithub();
  // Give the account a second way in — as linking a Google identity would.
  await prisma.user.update({
    where: { email: 'gh-new@nexthire.test' },
    data: { googleId: 'google-sub-for-gh-test' },
  });

  const response = await fetch(`${baseUrl}/auth/github/unlink`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.data.user.githubLinked, false);
  assert.equal(body.data.user.googleLinked, true);

  const user = await prisma.user.findUnique({ where: { email: 'gh-new@nexthire.test' } });
  assert.equal(user.githubId, null);
  assert.ok(
    await prisma.authEvent.findFirst({ where: { userId: user.id, type: 'GITHUB_UNLINKED' } }),
    'the unlink should be recorded on the security timeline'
  );
});

test('unlinking a provider that is not linked is a 400, not a silent success', async () => {
  const { accessToken } = await signInWithGithub();

  const response = await fetch(`${baseUrl}/auth/google/unlink`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.code, 'NOT_LINKED');
});

test('unlink requires authentication', async () => {
  const response = await fetch(`${baseUrl}/auth/github/unlink`, { method: 'POST' });
  assert.equal(response.status, 401);
});

test('remainingLoginMethods counts every method except the one being removed', () => {
  const both = { passwordHash: 'x', googleId: 'g', githubId: 'h' };
  assert.deepEqual(remainingLoginMethods(both, 'GITHUB'), ['password', 'Google']);
  assert.deepEqual(remainingLoginMethods(both, 'GOOGLE'), ['password', 'GitHub']);

  // A provider-only account: whichever one is being unlinked, nothing is left.
  assert.deepEqual(remainingLoginMethods({ passwordHash: null, githubId: 'h' }, 'GITHUB'), []);
  assert.deepEqual(remainingLoginMethods({ passwordHash: null, googleId: 'g' }, 'GOOGLE'), []);

  // Two providers and no password: either may go, because the other remains.
  const twoProviders = { passwordHash: null, googleId: 'g', githubId: 'h' };
  assert.deepEqual(remainingLoginMethods(twoProviders, 'GITHUB'), ['Google']);
  assert.deepEqual(remainingLoginMethods(twoProviders, 'GOOGLE'), ['GitHub']);
});

// ===========================================================================
// Not configured
// ===========================================================================

test('with GitHub unconfigured the endpoint reports it instead of half-starting a flow', async () => {
  const realId = authConfig.github.clientId;
  authConfig.github.clientId = '';
  try {
    const response = await fetch(`${baseUrl}/auth/github/start`, { redirect: 'manual' });
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.code, 'GITHUB_NOT_CONFIGURED');

    const config = await fetch(`${baseUrl}/auth/config`);
    assert.equal((await config.json()).data.githubEnabled, false);
  } finally {
    authConfig.github.clientId = realId;
  }
});
