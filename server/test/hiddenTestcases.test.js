const { test } = require('node:test');
const assert = require('node:assert');
const { buildExecutionDto, buildSubmissionDto } = require('../src/features/submission/submissionDto');

const execution = {
  id: 'e1',
  submissionId: 's1',
  status: 'WRONG_ANSWER',
  language: 'PYTHON',
  executionTime: 42,
  memoryUsed: null,
  passCount: 1,
  totalTestCases: 3,
  compilerOutput: '',
  runtimeOutput: 'hi',
  stderr: '',
  exitCode: 0,
  judgedAt: new Date('2026-01-01T00:00:00Z'),
  testResults: [
    { index: 0, isSample: true, verdict: 'ACCEPTED', stdout: '3', expectedOutput: '3', stderr: '' },
    { index: 1, isSample: false, verdict: 'WRONG_ANSWER', stdout: 'SECRET-OUT', expectedOutput: 'SECRET-EXPECTED', stderr: 'secret' },
    { index: 2, isSample: false, verdict: 'WRONG_ANSWER', stdout: 'SECRET2', expectedOutput: 'SECRET2E', stderr: '' }
  ]
};

test('non-admin DTO never leaks hidden test-case I/O', () => {
  const dto = buildExecutionDto(execution, { isAdmin: false });
  // Only the sample case survives.
  assert.strictEqual(dto.testResults.length, 1);
  assert.strictEqual(dto.testResults[0].isSample, true);
  const serialized = JSON.stringify(dto);
  assert.ok(!serialized.includes('SECRET-OUT'), 'hidden stdout must not appear');
  assert.ok(!serialized.includes('SECRET-EXPECTED'), 'hidden expected output must not appear');
  assert.ok(!serialized.includes('SECRET2'), 'no hidden case content at all');
});

test('non-admin still sees aggregate pass/total counts', () => {
  const dto = buildExecutionDto(execution, { isAdmin: false });
  assert.strictEqual(dto.passedTests, 1);
  assert.strictEqual(dto.totalTests, 3);
  assert.strictEqual(dto.status, 'WRONG_ANSWER');
});

test('admin DTO includes hidden test-case detail', () => {
  const dto = buildExecutionDto(execution, { isAdmin: true });
  assert.strictEqual(dto.testResults.length, 3);
  assert.ok(JSON.stringify(dto).includes('SECRET-EXPECTED'));
});

test('buildSubmissionDto embeds a hidden-safe execution for non-admins', () => {
  const submission = {
    id: 's1', userId: 'u1', questionId: 'q1', context: 'PRACTICE', contestId: null,
    language: 'PYTHON', status: 'WRONG_ANSWER', code: 'print(1)', createdAt: new Date(),
    executions: [execution]
  };
  const dto = buildSubmissionDto(submission, { isAdmin: false });
  assert.strictEqual(dto.execution.testResults.length, 1);
  assert.ok(!JSON.stringify(dto).includes('SECRET'));
});
