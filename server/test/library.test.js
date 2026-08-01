// Integration tests for the Question Library, run against the local Postgres (seeded).
// Exercises real controllers with the real prisma client, then cleans up its own rows.

const { test, before, after } = require('node:test');
const assert = require('node:assert');

const { prisma } = require('../src/shared/db');
const notes = require('../src/features/library/notesController');
const progress = require('../src/features/library/progressController');
const sheets = require('../src/features/library/sheetController');
const practice = require('../src/features/library/practiceController');
const question = require('../src/features/question-bank/questionController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  };
}
const req = (o = {}) => ({ params: {}, query: {}, body: {}, ...o });

let userA, userB, sampleQuestionId;

before(async () => {
  // Fresh test users (delete-then-create keeps the suite idempotent).
  await prisma.user.deleteMany({ where: { email: { in: ['test-lib-a@local', 'test-lib-b@local'] } } });
  userA = await prisma.user.create({ data: { email: 'test-lib-a@local', name: 'Lib A', role: 'CANDIDATE' } });
  userB = await prisma.user.create({ data: { email: 'test-lib-b@local', name: 'Lib B', role: 'CANDIDATE' } });

  const q = await prisma.question.findFirst({ where: { slug: 'two-sum' } })
    || await prisma.question.findFirst();
  sampleQuestionId = q.id;
});

after(async () => {
  // Cascades remove the users' progress/notes; sheets owned by them go too.
  await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
  await prisma.$disconnect();
});

test('private notes: user A saves, user B cannot read them', async () => {
  // A writes a note.
  let res = mockRes();
  await notes.upsertNote(req({ user: userA, params: { questionId: sampleQuestionId }, body: { approach: 'A-secret-approach' } }), res);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.approach, 'A-secret-approach');

  // A reads it back.
  res = mockRes();
  await notes.getNote(req({ user: userA, params: { questionId: sampleQuestionId } }), res);
  assert.strictEqual(res.body.data.approach, 'A-secret-approach');

  // B reads the same question → gets an empty shell, never A's content.
  res = mockRes();
  await notes.getNote(req({ user: userB, params: { questionId: sampleQuestionId } }), res);
  assert.notStrictEqual(res.body.data.approach, 'A-secret-approach');
  assert.ok(!res.body.data.approach);
});

test('progress: set status SOLVED and toggle bookmark', async () => {
  let res = mockRes();
  await progress.setStatus(req({ user: userA, params: { questionId: sampleQuestionId }, body: { status: 'SOLVED' } }), res);
  assert.strictEqual(res.body.data.status, 'SOLVED');

  res = mockRes();
  await progress.toggleBookmark(req({ user: userA, params: { questionId: sampleQuestionId }, body: {} }), res);
  assert.strictEqual(res.body.data.isBookmarked, true);

  // Stats reflect the solved question.
  res = mockRes();
  await progress.getStats(req({ user: userA }), res);
  assert.ok(res.body.data.solvedTotal >= 1);
  assert.ok(res.body.data.totalQuestions >= 1);
});

test('progress list can filter to bookmarked', async () => {
  const res = mockRes();
  await progress.listProgress(req({ user: userA, query: { bookmarked: 'true' } }), res);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.data.some((r) => r.question.id === sampleQuestionId));
});

test('sheets: system sheets are listed and Blind 75 has items', async () => {
  let res = mockRes();
  await sheets.listSheets(req({ user: userA }), res);
  assert.ok(res.body.data.some((s) => s.kind === 'SYSTEM'));

  res = mockRes();
  await sheets.getSheet(req({ user: userA, params: { slug: 'blind-75' } }), res);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.data.items.length > 0);
  // Each item carries a per-user progress dto.
  assert.ok('status' in res.body.data.items[0].progress);
});

test('sheets: create, add item, then delete a custom sheet (owner-scoped)', async () => {
  let res = mockRes();
  await sheets.createSheet(req({ user: userA, body: { name: 'My Test Sheet' } }), res);
  assert.strictEqual(res.statusCode, 201);
  const sheetId = res.body.data.id;

  res = mockRes();
  await sheets.addSheetItem(req({ user: userA, params: { id: sheetId }, body: { questionId: sampleQuestionId } }), res);
  assert.strictEqual(res.statusCode, 201);

  // User B cannot edit A's sheet.
  res = mockRes();
  await sheets.addSheetItem(req({ user: userB, params: { id: sheetId }, body: { questionId: sampleQuestionId } }), res);
  assert.strictEqual(res.statusCode, 403);

  res = mockRes();
  await sheets.deleteSheet(req({ user: userA, params: { id: sheetId } }), res);
  assert.strictEqual(res.body.success, true);
});

test('practice: daily returns a question, mixed returns a set', async () => {
  let res = mockRes();
  await practice.daily(req({ user: userA }), res);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.data && res.body.data.question);

  res = mockRes();
  await practice.mixed(req({ user: userA, query: { count: '5' } }), res);
  assert.ok(Array.isArray(res.body.data));
});

test('library browse: filter by source and company', async () => {
  let res = mockRes();
  await question.getQuestions(req({ user: userA, query: { source: 'LEETCODE', limit: '5' } }), res);
  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.data.every((q) => q.sourcePlatform === 'LEETCODE'));

  res = mockRes();
  await question.getQuestions(req({ user: userA, query: { companySlug: 'google', limit: '5' } }), res);
  assert.strictEqual(res.body.success, true);
  // Google collection should return at least one seeded reference.
  assert.ok(res.body.data.length > 0);
  // Each row carries a progress dto for the signed-in user.
  assert.ok(res.body.data[0].progress && 'status' in res.body.data[0].progress);
});

test('library browse: status=solved returns the solved question for user A', async () => {
  const res = mockRes();
  await question.getQuestions(req({ user: userA, query: { status: 'solved', limit: '50' } }), res);
  assert.ok(res.body.data.some((q) => q.id === sampleQuestionId));
});
