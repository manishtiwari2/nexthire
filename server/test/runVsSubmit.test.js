// Regression tests for the Run/Submit conflation found in the production audit.
//
// Originally the "Run sample tests" button and the "Submit" button hit the same endpoint
// with the same payload. Every Run therefore executed the hidden tests, recorded a permanent
// submission, counted as an attempt, and reported "0/3 passed" — telling the solver how many
// hidden cases exist and whether they pass, without them ever pressing Submit.
//
// processJob is dependency-injected, so these exercise the real logic with fakes.

const { test } = require('node:test');
const assert = require('node:assert');
const { processJob } = require('../src/features/judge/judgeProcessor');

const SAMPLE = { id: 't1', input: '1 2', expectedOutput: '3', isSample: true, orderIndex: 0 };
const HIDDEN_A = { id: 't2', input: '10 20', expectedOutput: '30', isSample: false, orderIndex: 1 };
const HIDDEN_B = { id: 't3', input: '-5 5', expectedOutput: '0', isSample: false, orderIndex: 2 };
const ALL = [SAMPLE, HIDDEN_A, HIDDEN_B];

/** Minimal prisma double that records what the processor asked for and wrote. */
function makePrisma(submission) {
  const calls = { testCaseWhere: null, progressUpdates: 0, participantUpdates: 0, submissionUpdates: [] };
  return {
    calls,
    submission: {
      findUnique: async () => submission,
      update: async ({ data }) => { calls.submissionUpdates.push(data.status); return submission; },
      count: async () => 0,
    },
    testCase: {
      findMany: async ({ where }) => {
        calls.testCaseWhere = where;
        return where.isSample === true ? ALL.filter((t) => t.isSample) : ALL;
      },
    },
    executionResult: { create: async ({ data }) => ({ id: 'exec-1', ...data }) },
    contestQuestion: { findFirst: async () => ({ points: 100 }) },
    contestParticipant: { updateMany: async () => { calls.participantUpdates++; } },
    // recordSubmissionOutcome writes through these:
    userQuestionProgress: {
      findUnique: async () => null,
      upsert: async () => { calls.progressUpdates++; return {}; },
      update: async () => { calls.progressUpdates++; return {}; },
      create: async () => { calls.progressUpdates++; return {}; },
    },
    revisionSchedule: {
      findUnique: async () => null,
      upsert: async () => ({}),
      create: async () => ({}),
    },
  };
}

const executorFor = (result) => ({ executeSubmission: async (_job, testCases) => ({
  status: result, compilerOutput: '', runtimeOutput: '', stderr: '', exitCode: 0,
  executionTime: 10, memoryUsed: null,
  passedTests: result === 'ACCEPTED' ? testCases.length : 0,
  totalTests: testCases.length, testResults: [],
}) });

const job = { submissionId: 's1', questionId: 'q1', code: 'print(3)', language: 'PYTHON' };

test('a trial run is judged against SAMPLE test cases only', async () => {
  const prisma = makePrisma({ id: 's1', userId: 'u1', context: 'PRACTICE', contestId: null, isTrialRun: true });
  const execution = await processJob({ prisma, executor: executorFor('ACCEPTED'), publish: null }, job);

  assert.strictEqual(prisma.calls.testCaseWhere.isSample, true, 'run must filter to sample cases');
  assert.strictEqual(execution.totalTestCases, 1, 'only the sample case runs');
});

test('a real submission is judged against every test case', async () => {
  const prisma = makePrisma({ id: 's1', userId: 'u1', context: 'PRACTICE', contestId: null, isTrialRun: false });
  const execution = await processJob({ prisma, executor: executorFor('ACCEPTED'), publish: null }, job);

  assert.strictEqual(prisma.calls.testCaseWhere.isSample, undefined, 'submit must not filter test cases');
  assert.strictEqual(execution.totalTestCases, 3, 'sample + hidden cases all run');
});

test('a trial run never records progress', async () => {
  const prisma = makePrisma({ id: 's1', userId: 'u1', context: 'PRACTICE', contestId: null, isTrialRun: true });
  await processJob({ prisma, executor: executorFor('ACCEPTED'), publish: null }, job);
  assert.strictEqual(prisma.calls.progressUpdates, 0, 'a run must not mark a question solved or count an attempt');
});

test('a real submission does record progress', async () => {
  const prisma = makePrisma({ id: 's1', userId: 'u1', context: 'PRACTICE', contestId: null, isTrialRun: false });
  await processJob({ prisma, executor: executorFor('ACCEPTED'), publish: null }, job);
  assert.ok(prisma.calls.progressUpdates > 0, 'a submit must update progress');
});

test('a trial run never awards contest points', async () => {
  const prisma = makePrisma({ id: 's1', userId: 'u1', context: 'CONTEST', contestId: 'c1', isTrialRun: true });
  await processJob({ prisma, executor: executorFor('ACCEPTED'), publish: null }, job);
  assert.strictEqual(prisma.calls.participantUpdates, 0, 'a run must not move the leaderboard');
});

test('a real contest submission awards points', async () => {
  const prisma = makePrisma({ id: 's1', userId: 'u1', context: 'CONTEST', contestId: 'c1', isTrialRun: false });
  await processJob({ prisma, executor: executorFor('ACCEPTED'), publish: null }, job);
  assert.strictEqual(prisma.calls.participantUpdates, 1, 'a submit must award points once');
});

test('the trial-run flag is read from the row, not the job payload', async () => {
  // A re-enqueued or reconciled job carries only ids; if the processor trusted the payload,
  // a replayed run would silently be promoted to a full submission against hidden tests.
  const prisma = makePrisma({ id: 's1', userId: 'u1', context: 'PRACTICE', contestId: null, isTrialRun: true });
  await processJob({ prisma, executor: executorFor('ACCEPTED'), publish: null }, { ...job, isTrialRun: false });
  assert.strictEqual(prisma.calls.testCaseWhere.isSample, true, 'the row is authoritative');
});

test('a run still reaches a terminal status so the client stops polling', async () => {
  const prisma = makePrisma({ id: 's1', userId: 'u1', context: 'PRACTICE', contestId: null, isTrialRun: true });
  await processJob({ prisma, executor: executorFor('WRONG_ANSWER'), publish: null }, job);
  assert.deepStrictEqual(prisma.calls.submissionUpdates, ['RUNNING', 'WRONG_ANSWER']);
});
