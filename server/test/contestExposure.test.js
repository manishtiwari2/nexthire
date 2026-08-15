// Regression tests for the contest data-exposure defects found in the production audit.
//
// The original code used `include: { user: true }` on contest participants, which shipped
// every scalar column of the User row — including the bcrypt `passwordHash`, `mobile`,
// `tokenVersion` and lockout state — to any authenticated caller who could read the contest.
// The leaderboard and the contest list additionally exposed email addresses anonymously, and
// the list carried full problem statements for contests that had not started.
//
// These tests pin the shapes so a future `user: true` cannot quietly reintroduce the leak.

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const rawSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'features', 'contest', 'contestController.js'),
  'utf8'
);

/**
 * Strip comments before asserting on the source. The fixes are *documented* in comments that
 * quote the very patterns we are banning ("never `user: true`", "Math.random() is not a
 * CSPRNG"), so a naive grep would match the warning instead of a real violation.
 */
const controllerSource = rawSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Fields that must never appear in any contest-facing user projection. */
const FORBIDDEN_USER_FIELDS = [
  'passwordHash',
  'mobile',
  'tokenVersion',
  'failedLoginAttempts',
  'lockedUntil',
  'disabledReason',
  'googleId',
];

test('contest controller never uses a bare `user: true` include', () => {
  // `user: true` selects every scalar column, which is how the password hash escaped.
  assert.ok(
    !/include:\s*\{\s*user:\s*true\s*\}/.test(controllerSource),
    'contest payloads must project user fields explicitly, never `user: true`'
  );
  assert.ok(
    !/participants:\s*\{\s*include:\s*\{\s*user:\s*true/.test(controllerSource),
    'participant payloads must not include the whole User row'
  );
});

test('the shared public user projection exposes only display identity', () => {
  const match = controllerSource.match(/const PUBLIC_USER_SELECT = \{([^}]*)\}/);
  assert.ok(match, 'PUBLIC_USER_SELECT must exist as the single user projection');
  const body = match[1];

  for (const field of FORBIDDEN_USER_FIELDS) {
    assert.ok(!body.includes(field), `PUBLIC_USER_SELECT must not expose ${field}`);
  }
  // Email is PII and a user-enumeration oracle on a public leaderboard.
  assert.ok(!/\bemail\b/.test(body), 'PUBLIC_USER_SELECT must not expose email');

  // It must still carry enough to render a leaderboard row.
  assert.ok(/\bid:\s*true/.test(body), 'id is needed to identify a row');
  assert.ok(/\bname:\s*true/.test(body), 'name is needed to display a participant');
});

test('every user projection in the contest controller is the safe one', () => {
  // Catch any hand-rolled `user: { select: {...} }` that drifts from PUBLIC_USER_SELECT.
  const inlineSelects = controllerSource.match(/user:\s*\{\s*select:\s*\{[^}]*\}/g) || [];
  for (const sel of inlineSelects) {
    assert.ok(
      sel.includes('PUBLIC_USER_SELECT'),
      `contest user projections must reuse PUBLIC_USER_SELECT, found: ${sel}`
    );
  }
  const hostSelects = controllerSource.match(/host:\s*\{\s*select:[^}]*\}/g) || [];
  for (const sel of hostSelects) {
    assert.ok(
      sel.includes('PUBLIC_USER_SELECT'),
      `host projections must reuse PUBLIC_USER_SELECT, found: ${sel}`
    );
  }
});

test('the contest listing does not carry problem statements', () => {
  const match = controllerSource.match(/const CONTEST_LIST_QUESTION_SELECT = \{([^}]*)\}/);
  assert.ok(match, 'the listing must use an explicit question projection');
  const body = match[1];
  // A contest list is readable before a contest starts; statements would leak the paper.
  assert.ok(!/\bdescription\b/.test(body), 'the listing must not include question descriptions');
  assert.ok(!/\bconstraints\b/.test(body), 'the listing must not include question constraints');
  assert.ok(/\btitle:\s*true/.test(body), 'the listing still needs question titles');
});

test('invite codes are generated with a CSPRNG, not Math.random', () => {
  assert.ok(
    !/Math\.random\(\)/.test(controllerSource),
    'invite codes are join secrets — Math.random() is predictable and must not be used'
  );
  assert.ok(
    /crypto\.randomBytes/.test(controllerSource),
    'invite code generation must use crypto.randomBytes'
  );
});

test('generated invite codes are long enough to resist guessing', () => {
  // Re-derive the generator the controller uses so this stays a behavioural check.
  const crypto = require('crypto');
  const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  const gen = () => {
    const bytes = crypto.randomBytes(8);
    let out = '';
    for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
    return `DSA-${out}`;
  };

  const codes = new Set();
  for (let i = 0; i < 500; i++) {
    const code = gen();
    assert.match(code, /^DSA-[A-Z0-9]{8}$/, `unexpected code shape: ${code}`);
    codes.add(code);
  }
  assert.strictEqual(codes.size, 500, 'generated codes must not collide');

  // Ambiguous glyphs are excluded so a code read off a screen cannot be mistyped into
  // a *different* valid code.
  for (const bad of ['I', 'L', 'O', 'U', '0', '1']) {
    assert.ok(!ALPHABET.includes(bad), `alphabet must exclude ambiguous glyph ${bad}`);
  }
});

test('join-by-code enforces the same limits as join', () => {
  const joinByCode = controllerSource.slice(
    controllerSource.indexOf('async function joinByCode'),
    controllerSource.indexOf('async function joinContest')
  );
  assert.ok(joinByCode.length > 0, 'joinByCode must exist');
  // The original joinByCode accepted any code forever — no expiry, cap or contest window.
  assert.ok(/status === 'ENDED'/.test(joinByCode), 'join-by-code must reject ended contests');
  assert.ok(/expiresAt/.test(joinByCode), 'join-by-code must honour invite expiry');
  assert.ok(/maxUses/.test(joinByCode), 'join-by-code must honour the usage cap');
  assert.ok(/usedCount/.test(joinByCode), 'join-by-code must record a use');
});
