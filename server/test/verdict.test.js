const { test } = require('node:test');
const assert = require('node:assert');
const { VERDICT, normalizeOutput, compareOutput, determineVerdict } = require('../src/features/judge/executor/verdict');

test('normalizeOutput ignores trailing whitespace and blank edge lines', () => {
  assert.strictEqual(normalizeOutput('42\n'), '42');
  assert.strictEqual(normalizeOutput('42  \r\n'), '42');
  assert.strictEqual(normalizeOutput('\n\nhello\nworld\n\n'), 'hello\nworld');
});

test('compareOutput treats CRLF and trailing spaces as equal', () => {
  assert.ok(compareOutput('1 2 3', '1 2 3\n'));
  assert.ok(compareOutput('a\nb', 'a\r\nb  '));
  assert.ok(!compareOutput('1 2 3', '1 2 4'));
});

test('determineVerdict ACCEPTED when output matches and clean exit', () => {
  const run = { timedOut: false, oomKilled: false, outputTruncated: false, exitCode: 0, stdout: '3\n' };
  assert.strictEqual(determineVerdict(run, '3'), VERDICT.ACCEPTED);
});

test('determineVerdict WRONG_ANSWER when output differs', () => {
  const run = { timedOut: false, oomKilled: false, outputTruncated: false, exitCode: 0, stdout: '4' };
  assert.strictEqual(determineVerdict(run, '3'), VERDICT.WRONG_ANSWER);
});

test('determineVerdict RUNTIME_ERROR on non-zero exit', () => {
  const run = { timedOut: false, oomKilled: false, outputTruncated: false, exitCode: 1, stdout: '' };
  assert.strictEqual(determineVerdict(run, ''), VERDICT.RUNTIME_ERROR);
});

test('determineVerdict TIME_LIMIT_EXCEEDED takes priority over exit code', () => {
  const run = { timedOut: true, oomKilled: false, outputTruncated: false, exitCode: 137, stdout: '' };
  assert.strictEqual(determineVerdict(run, ''), VERDICT.TIME_LIMIT_EXCEEDED);
});

test('determineVerdict MEMORY_LIMIT_EXCEEDED on OOM', () => {
  const run = { timedOut: false, oomKilled: true, outputTruncated: false, exitCode: 137, stdout: '' };
  assert.strictEqual(determineVerdict(run, ''), VERDICT.MEMORY_LIMIT_EXCEEDED);
});

test('determineVerdict OUTPUT_LIMIT_EXCEEDED when stdout truncated', () => {
  const run = { timedOut: false, oomKilled: false, outputTruncated: true, exitCode: 0, stdout: 'xxxx' };
  assert.strictEqual(determineVerdict(run, 'xxxx'), VERDICT.OUTPUT_LIMIT_EXCEEDED);
});
