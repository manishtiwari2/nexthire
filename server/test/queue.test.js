const { test } = require('node:test');
const assert = require('node:assert');
const { JudgeQueue } = require('../src/features/judge/judgeQueue');
const { buildEventPayload } = require('../src/features/judge/judgeEvents');

// Stub the BullMQ queue so no Redis connection is opened.
function withFakeQueue() {
  const q = new JudgeQueue();
  const added = [];
  const fake = {
    add: async (name, data, opts) => { added.push({ name, data, opts }); return { id: opts.jobId }; },
    getJob: async (id) => ({
      id,
      getState: async () => 'waiting',
      remove: async () => { fake._removed = id; }
    })
  };
  q._getQueue = () => fake;
  return { q, added, fake };
}

test('enqueueJob uses submissionId as jobId and forwards the payload', async () => {
  const { q, added } = withFakeQueue();
  const id = await q.enqueueJob({ submissionId: 's42', questionId: 'q1', code: 'x', language: 'PYTHON', timeLimitMs: 2000 });
  assert.strictEqual(id, 's42');
  assert.strictEqual(added.length, 1);
  assert.strictEqual(added[0].opts.jobId, 's42');
  assert.strictEqual(added[0].data.language, 'PYTHON');
  assert.strictEqual(added[0].data.questionId, 'q1');
});

test('enqueueJob rejects a job without a submissionId', async () => {
  const { q } = withFakeQueue();
  await assert.rejects(() => q.enqueueJob({ questionId: 'q1' }), /submissionId/);
});

test('cancelJob removes a waiting job', async () => {
  const { q, fake } = withFakeQueue();
  const ok = await q.cancelJob('s42');
  assert.strictEqual(ok, true);
  assert.strictEqual(fake._removed, 's42');
});

test('buildEventPayload keeps the wire payload light and hidden-safe', () => {
  const payload = buildEventPayload({
    submissionId: 's1', userId: 'u1', phase: 'COMPLETED',
    result: {
      status: 'WRONG_ANSWER', passedTests: 1, totalTests: 3, executionTime: 10, memoryUsed: 8,
      compilerOutput: '', stderr: 'boom',
      testResults: [{ isSample: false, stdout: 'SECRET' }]
    }
  });
  assert.strictEqual(payload.userId, 'u1');
  assert.strictEqual(payload.status, 'WRONG_ANSWER');
  assert.strictEqual(payload.result.passedTests, 1);
  // Full per-test detail (which may include hidden cases) is never broadcast.
  assert.ok(!('testResults' in payload.result));
  assert.ok(!JSON.stringify(payload).includes('SECRET'));
});
