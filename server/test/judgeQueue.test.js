const assert = require('assert');
const { InMemoryJudgeQueue } = require('../src/features/judge/InMemoryJudgeQueue');

async function testJudgeQueue() {
  const queue = new InMemoryJudgeQueue();

  const jobId = await queue.enqueueJob({
    submissionId: 'sub-test-101',
    questionId: 'q-test-101',
    code: 'function solution(a, b) { return a + b; }',
    language: 'JAVASCRIPT',
    timeLimitMs: 2000,
    memoryLimitMb: 256
  });

  assert.ok(jobId.startsWith('job-'), 'Job ID should be generated with prefix job-');
  const initialStatus = await queue.getJobStatus(jobId);
  assert.strictEqual(initialStatus, 'QUEUED', 'Job initial status should be QUEUED');

  console.log('✓ Isolated Judge Worker Queue Unit Tests PASSED (2/2)');
}

testJudgeQueue().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
