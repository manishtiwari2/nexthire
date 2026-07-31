const { test } = require('node:test');
const assert = require('node:assert');

// Override the shared prisma singleton BEFORE requiring the controller, so no real DB is hit.
const db = require('../src/shared/db');
const submissionRow = {
  id: 's1', userId: 'owner', questionId: 'q1', context: 'PRACTICE', contestId: null,
  language: 'PYTHON', status: 'ACCEPTED', code: 'print(1)', createdAt: new Date(),
  executions: [{ id: 'e1', submissionId: 's1', status: 'ACCEPTED', passCount: 1, totalTestCases: 1, testResults: [] }]
};
db.prisma.submission = {
  findUnique: async () => submissionRow,
  update: async () => ({})
};

const { getSubmission, cancelSubmission } = require('../src/features/submission/submissionController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  };
}

test('owner can read their submission', async () => {
  const res = mockRes();
  await getSubmission({ params: { id: 's1' }, user: { id: 'owner', role: 'CANDIDATE' } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.id, 's1');
});

test('a different user is denied (IDOR guard)', async () => {
  const res = mockRes();
  await getSubmission({ params: { id: 's1' }, user: { id: 'someone-else', role: 'CANDIDATE' } }, res);
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(res.body.success, false);
});

test('admin can read any submission', async () => {
  const res = mockRes();
  await getSubmission({ params: { id: 's1' }, user: { id: 'admin', role: 'ADMIN' } }, res);
  assert.strictEqual(res.statusCode, 200);
});

test('non-admin non-owner cannot cancel', async () => {
  const res = mockRes();
  await cancelSubmission({ params: { id: 's1' }, user: { id: 'intruder', role: 'CANDIDATE' } }, res);
  assert.strictEqual(res.statusCode, 403);
});

test('cannot cancel a submission that is not PENDING', async () => {
  const res = mockRes();
  // submissionRow.status is ACCEPTED
  await cancelSubmission({ params: { id: 's1' }, user: { id: 'owner', role: 'CANDIDATE' } }, res);
  assert.strictEqual(res.statusCode, 409);
});
