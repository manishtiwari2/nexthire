// Regression tests for two exploitable defects found during the pre-deployment audit.
// Both were confirmed live against a running API before the fix, not inferred from reading.
//
//   1. HIDDEN TEST LEAK — `GET /questions/submission/:id` and `GET /questions/:id/submissions`
//      returned the raw Prisma rows. `executions[].testResults` carries the expected output of
//      every HIDDEN test case, so any solver could read the graded answers for the tests they
//      are explicitly not allowed to see. Both now go through buildSubmissionDto.
//
//   2. CONTEST BYPASS — `POST /questions/:id/execute` read `context` and `contestId` straight
//      from the request body, so a client could post `context: 'CONTEST'` with any contest id
//      and skip every check the contest endpoint enforces. Reproduced: 100 points awarded in a
//      contest that had already ENDED, and in a contest that never contained the question.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('path');

const { buildSubmissionDto } = require('../src/features/submission/submissionDto');

const CONTROLLER_SRC = fs.readFileSync(
  path.join(__dirname, '../src/features/question-bank/questionController.js'),
  'utf8'
);

// --- 1. hidden test-case leakage -------------------------------------------

const executionWithHiddenCase = {
  id: 'e1',
  submissionId: 's1',
  status: 'ACCEPTED',
  language: 'PYTHON',
  passCount: 2,
  totalTestCases: 2,
  compilerOutput: '',
  runtimeOutput: '3',
  stderr: '',
  exitCode: 0,
  judgedAt: new Date(),
  testResults: [
    { index: 0, isSample: true, verdict: 'ACCEPTED', stdout: '3', expectedOutput: '3' },
    { index: 1, isSample: false, verdict: 'ACCEPTED', stdout: 'HIDDEN-ANSWER', expectedOutput: 'HIDDEN-ANSWER' },
  ],
};

const submissionRow = {
  id: 's1',
  userId: 'u1',
  questionId: 'q1',
  context: 'PRACTICE',
  contestId: null,
  language: 'PYTHON',
  status: 'ACCEPTED',
  code: 'print(3)',
  createdAt: new Date(),
  executions: [executionWithHiddenCase],
};

test('the submission-history shape hides hidden-case answers from the owner', () => {
  const dto = buildSubmissionDto(submissionRow, { isAdmin: false });
  assert.ok(
    !JSON.stringify(dto).includes('HIDDEN-ANSWER'),
    'a solver must never receive the expected output of a hidden test case'
  );
  // The aggregate is still honest.
  assert.strictEqual(dto.execution.passedTests, 2);
  assert.strictEqual(dto.execution.totalTests, 2);
});

test('the raw Prisma row would have leaked — this is what the DTO prevents', () => {
  assert.ok(
    JSON.stringify(submissionRow).includes('HIDDEN-ANSWER'),
    'sanity check: the raw row really does carry the hidden answer'
  );
});

test('question-bank submission read paths serialise through buildSubmissionDto', () => {
  assert.match(
    CONTROLLER_SRC,
    /buildSubmissionDto/,
    'questionController must serialise submissions through the hidden-test-safe DTO'
  );
  // Neither read path may hand back a bare Prisma row again.
  assert.doesNotMatch(
    CONTROLLER_SRC,
    /res\.json\(\{\s*success:\s*true,\s*data:\s*submission\s*\}\)/,
    'getSubmissionResult must not return the raw submission row'
  );
  assert.doesNotMatch(
    CONTROLLER_SRC,
    /res\.json\(\{\s*success:\s*true,\s*data:\s*submissions\s*\}\)/,
    'getUserSubmissionsForQuestion must not return raw submission rows'
  );
});

// --- 2. contest-context bypass ---------------------------------------------

test('the practice execute endpoint does not take context/contestId from the client', () => {
  // The destructure of req.body must not pull in contest routing fields.
  const destructure = /const \{([^}]*)\} = req\.body;/.exec(CONTROLLER_SRC);
  assert.ok(destructure, 'expected a req.body destructure in submitCodeExecution');
  const fields = destructure[1];
  for (const forbidden of ['context', 'contestId', 'interviewId']) {
    assert.ok(
      !new RegExp(`\\b${forbidden}\\b`).test(fields),
      `submitCodeExecution must not read "${forbidden}" from the request body — ` +
      'that is what allowed scoring an ended contest and a contest the question was not in'
    );
  }
});

test('practice submissions are pinned to context PRACTICE', () => {
  assert.match(
    CONTROLLER_SRC,
    /context:\s*'PRACTICE'/,
    'the practice endpoint must hard-code context: PRACTICE'
  );
  assert.doesNotMatch(
    CONTROLLER_SRC,
    /context:\s*context\s*\|\|/,
    'context must not fall back to a client-supplied value'
  );
});

test('only the contest endpoint may create CONTEST submissions', () => {
  const contestSrc = fs.readFileSync(
    path.join(__dirname, '../src/features/contest/contestController.js'),
    'utf8'
  );
  // The contest endpoint checks the window, membership and participation before creating.
  assert.match(contestSrc, /has ended; submissions are closed/, 'contest window must be enforced');
  assert.match(contestSrc, /Question is not part of this contest/, 'question membership must be enforced');
  assert.match(contestSrc, /non-disqualified contest participant/, 'participation must be enforced');
});
