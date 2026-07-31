const { test } = require('node:test');
const assert = require('node:assert');

// Override the shared prisma singleton + judge queue BEFORE requiring the controller,
// so no real DB / Redis is touched. These tests lock in the contest-window and language
// guards that make "the contest ends when the timer expires" real on the server.
const db = require('../src/shared/db');
const { judgeQueueInstance } = require('../src/features/judge/judgeQueue');

const HOUR = 3600 * 1000;
let contest; // mutated per test

db.prisma.contest = { findUnique: async () => contest };
db.prisma.question = { findUnique: async () => ({ id: 'q1', timeLimitMs: 2000, memoryLimitMb: 256 }) };
db.prisma.contestQuestion = { findFirst: async () => ({ id: 'cq1', contestId: 'c1', questionId: 'q1' }) };
db.prisma.contestParticipant = {
  findUnique: async () => ({ id: 'p1', isDisqualified: false }),
  update: async () => ({})
};
db.prisma.submission = { create: async (args) => ({ id: 's1', ...args.data }) };
judgeQueueInstance.enqueueJob = async () => 'job1';

const { submitContestCode } = require('../src/features/contest/contestController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  };
}
function req(body) {
  return { params: { id: 'c1' }, user: { id: 'u1', role: 'CANDIDATE' }, body };
}
const validBody = { questionId: 'q1', code: 'print(1)', language: 'python' };

test('accepts a submission while the contest is live', async () => {
  contest = { id: 'c1', status: 'LIVE', startTime: new Date(Date.now() - HOUR), endTime: new Date(Date.now() + HOUR) };
  const res = mockRes();
  await submitContestCode(req(validBody), res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.status, 'QUEUED');
});

test('rejects a submission after the contest has ended (by time)', async () => {
  contest = { id: 'c1', status: 'LIVE', startTime: new Date(Date.now() - 2 * HOUR), endTime: new Date(Date.now() - HOUR) };
  const res = mockRes();
  await submitContestCode(req(validBody), res);
  assert.strictEqual(res.statusCode, 403);
  assert.match(res.body.error, /ended/i);
});

test('rejects a submission when contest status is ENDED', async () => {
  contest = { id: 'c1', status: 'ENDED', startTime: new Date(Date.now() - 2 * HOUR), endTime: new Date(Date.now() + HOUR) };
  const res = mockRes();
  await submitContestCode(req(validBody), res);
  assert.strictEqual(res.statusCode, 403);
});

test('rejects a submission before the contest starts', async () => {
  contest = { id: 'c1', status: 'UPCOMING', startTime: new Date(Date.now() + HOUR), endTime: new Date(Date.now() + 2 * HOUR) };
  const res = mockRes();
  await submitContestCode(req(validBody), res);
  assert.strictEqual(res.statusCode, 403);
  assert.match(res.body.error, /not started/i);
});

test('rejects an unsupported language', async () => {
  contest = { id: 'c1', status: 'LIVE', startTime: new Date(Date.now() - HOUR), endTime: new Date(Date.now() + HOUR) };
  const res = mockRes();
  await submitContestCode(req({ ...validBody, language: 'go' }), res);
  assert.strictEqual(res.statusCode, 400);
  assert.match(res.body.error, /not supported/i);
});
