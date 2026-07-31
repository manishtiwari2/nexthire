const { test } = require('node:test');
const assert = require('node:assert');
const { processJob } = require('../src/features/judge/judgeProcessor');

// ---- Fakes -----------------------------------------------------------------
function makeFakePrisma(overrides = {}) {
  const calls = { submissionUpdates: [], executionCreates: [], participantUpdates: [] };
  const prisma = {
    submission: {
      findUnique: async () => overrides.submission || { id: 's1', userId: 'u1', context: 'PRACTICE', contestId: null, questionId: 'q1' },
      update: async (args) => { calls.submissionUpdates.push(args.data); return {}; },
      count: async () => overrides.priorAccepted ?? 0
    },
    testCase: {
      findMany: async () => overrides.testCases || [
        { input: '1', expectedOutput: '1', isSample: true },
        { input: '2', expectedOutput: '2', isSample: false }
      ]
    },
    executionResult: {
      create: async (args) => { calls.executionCreates.push(args.data); return { id: 'exec1', ...args.data }; }
    },
    contestQuestion: { findFirst: async () => overrides.contestQuestion || { points: 150 } },
    contestParticipant: { updateMany: async (args) => { calls.participantUpdates.push(args); return { count: 1 }; } }
  };
  return { prisma, calls };
}

function makeFakeExecutor(result) {
  return { executeSubmission: async () => result };
}

const ACCEPTED_RESULT = {
  status: 'ACCEPTED', compilerOutput: '', runtimeOutput: '1', stderr: '', exitCode: 0,
  executionTime: 12, memoryUsed: 8, passedTests: 2, totalTests: 2,
  testResults: [{ index: 0, isSample: true, verdict: 'ACCEPTED' }]
};

test('processJob persists execution and marks submission RUNNING then final', async () => {
  const { prisma, calls } = makeFakePrisma();
  const events = [];
  await processJob(
    { prisma, executor: makeFakeExecutor(ACCEPTED_RESULT), publish: async (p) => events.push(p) },
    { submissionId: 's1', questionId: 'q1', code: 'print(1)', language: 'PYTHON' }
  );

  // RUNNING first, ACCEPTED last.
  assert.deepStrictEqual(calls.submissionUpdates[0], { status: 'RUNNING' });
  assert.deepStrictEqual(calls.submissionUpdates[calls.submissionUpdates.length - 1], { status: 'ACCEPTED' });

  // ExecutionResult mapped correctly (passedTests -> passCount, etc.).
  const exec = calls.executionCreates[0];
  assert.strictEqual(exec.submissionId, 's1');
  assert.strictEqual(exec.status, 'ACCEPTED');
  assert.strictEqual(exec.passCount, 2);
  assert.strictEqual(exec.totalTestCases, 2);
  assert.strictEqual(exec.language, 'PYTHON');
});

test('processJob emits RUNNING then COMPLETED events', async () => {
  const { prisma } = makeFakePrisma();
  const events = [];
  await processJob(
    { prisma, executor: makeFakeExecutor(ACCEPTED_RESULT), publish: async (p) => events.push(p) },
    { submissionId: 's1', questionId: 'q1', code: 'x', language: 'PYTHON' }
  );
  assert.strictEqual(events[0].phase, 'RUNNING');
  assert.strictEqual(events[events.length - 1].phase, 'COMPLETED');
  assert.strictEqual(events[events.length - 1].result.status, 'ACCEPTED');
  // Event payload must not carry full per-test detail.
  assert.ok(!('testResults' in events[events.length - 1].result));
});

test('processJob awards contest points on first ACCEPTED', async () => {
  const { prisma, calls } = makeFakePrisma({
    submission: { id: 's1', userId: 'u1', context: 'CONTEST', contestId: 'c1', questionId: 'q1' },
    priorAccepted: 0,
    contestQuestion: { points: 150 }
  });
  await processJob(
    { prisma, executor: makeFakeExecutor(ACCEPTED_RESULT), publish: async () => {} },
    { submissionId: 's1', questionId: 'q1', code: 'x', language: 'PYTHON' }
  );
  assert.strictEqual(calls.participantUpdates.length, 1);
  assert.deepStrictEqual(calls.participantUpdates[0].data, { score: { increment: 150 } });
});

test('processJob does NOT double-award when already accepted before', async () => {
  const { prisma, calls } = makeFakePrisma({
    submission: { id: 's1', userId: 'u1', context: 'CONTEST', contestId: 'c1', questionId: 'q1' },
    priorAccepted: 1
  });
  await processJob(
    { prisma, executor: makeFakeExecutor(ACCEPTED_RESULT), publish: async () => {} },
    { submissionId: 's1', questionId: 'q1', code: 'x', language: 'PYTHON' }
  );
  assert.strictEqual(calls.participantUpdates.length, 0);
});

test('processJob records INTERNAL_ERROR if the executor throws', async () => {
  const { prisma, calls } = makeFakePrisma();
  const executor = { executeSubmission: async () => { throw new Error('docker down'); } };
  await processJob(
    { prisma, executor, publish: async () => {} },
    { submissionId: 's1', questionId: 'q1', code: 'x', language: 'PYTHON' }
  );
  assert.strictEqual(calls.executionCreates[0].status, 'INTERNAL_ERROR');
  assert.deepStrictEqual(calls.submissionUpdates[calls.submissionUpdates.length - 1], { status: 'INTERNAL_ERROR' });
});

test('processJob no-ops when submission is missing (cancelled/deleted)', async () => {
  const { prisma, calls } = makeFakePrisma({ submission: null });
  prisma.submission.findUnique = async () => null;
  const ret = await processJob(
    { prisma, executor: makeFakeExecutor(ACCEPTED_RESULT), publish: async () => {} },
    { submissionId: 'gone', questionId: 'q1', code: 'x', language: 'PYTHON' }
  );
  assert.strictEqual(ret, null);
  assert.strictEqual(calls.executionCreates.length, 0);
});
