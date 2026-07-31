// Submission/ExecutionResult serialization — with hidden-test-case protection.
//
// Pure functions (no DB) so the leakage rules are unit-tested directly. The golden rule:
// a non-admin must NEVER receive the input/expected-output/stdout of a HIDDEN (non-sample)
// test case. Sample cases are public; hidden cases only ever contribute to the aggregate
// pass/total counts.

/**
 * @param {object} execution a Prisma ExecutionResult row (testResults is a JSON array)
 * @param {{isAdmin?:boolean}} [opts]
 */
function buildExecutionDto(execution, opts = {}) {
  if (!execution) return null;
  const isAdmin = Boolean(opts.isAdmin);
  const raw = Array.isArray(execution.testResults) ? execution.testResults : [];

  // Non-admins only ever see sample-case detail; hidden cases are dropped entirely.
  const testResults = (isAdmin ? raw : raw.filter((t) => t && t.isSample)).map((t) => ({
    index: t.index,
    isSample: Boolean(t.isSample),
    verdict: t.verdict,
    executionTime: t.executionTime ?? null,
    memoryUsed: t.memoryUsed ?? null,
    exitCode: t.exitCode ?? null,
    stdout: t.stdout ?? '',
    stderr: t.stderr ?? '',
    expectedOutput: t.expectedOutput ?? ''
  }));

  return {
    id: execution.id,
    submissionId: execution.submissionId,
    status: execution.status,
    language: execution.language ?? null,
    executionTime: execution.executionTime ?? null,
    memoryUsed: execution.memoryUsed ?? null,
    passedTests: execution.passCount ?? 0,
    totalTests: execution.totalTestCases ?? 0,
    compilerOutput: execution.compilerOutput ?? '',
    runtimeOutput: execution.runtimeOutput ?? '',
    stderr: execution.stderr ?? '',
    exitCode: execution.exitCode ?? null,
    testResults,
    judgedAt: execution.judgedAt ?? null
  };
}

/**
 * @param {object} submission a Prisma Submission row, optionally with `executions` included
 * @param {{isAdmin?:boolean}} [opts]
 */
function buildSubmissionDto(submission, opts = {}) {
  if (!submission) return null;
  const latest = Array.isArray(submission.executions) ? submission.executions[0] : null;
  return {
    id: submission.id,
    userId: submission.userId,
    questionId: submission.questionId,
    context: submission.context,
    contestId: submission.contestId ?? null,
    language: submission.language,
    status: submission.status,
    code: submission.code,
    createdAt: submission.createdAt,
    execution: buildExecutionDto(latest, opts)
  };
}

module.exports = { buildExecutionDto, buildSubmissionDto };
