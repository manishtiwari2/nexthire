// Judge processor — the testable core of a judge job.
//
// All I/O dependencies (prisma, executor, publish) are injected, so this function can be
// unit-tested with fakes and no Docker/Redis/DB. judgeWorker.js wires in the real ones.

const { buildEventPayload } = require('./judgeEvents');
const { recordSubmissionOutcome } = require('../library/progressService');

/**
 * Evaluate one submission end-to-end and persist the result.
 *
 * @param {object} deps
 * @param {object} deps.prisma      Prisma client
 * @param {{executeSubmission:Function}} deps.executor  active sandbox executor
 * @param {(payload:object)=>Promise<void>} deps.publish  emits a lifecycle event
 * @param {{submissionId:string, questionId:string, code:string, language:string,
 *          timeLimitMs?:number, memoryLimitMb?:number}} job
 * @returns {Promise<object>} the persisted ExecutionResult (or a plain result on DB-less runs)
 */
async function processJob({ prisma, executor, publish }, job) {
  const submission = await prisma.submission.findUnique({ where: { id: job.submissionId } });
  if (!submission) {
    // Submission was deleted/cancelled before we got to it — nothing to do.
    return null;
  }
  const userId = submission.userId;

  // Mark RUNNING and tell the user's clients we've started.
  await prisma.submission.update({ where: { id: job.submissionId }, data: { status: 'RUNNING' } });
  await safePublish(publish, buildEventPayload({ submissionId: job.submissionId, userId, phase: 'RUNNING', status: 'RUNNING' }));

  // Load test cases (sample first, then hidden — both are executed).
  const testCases = await prisma.testCase.findMany({
    where: { questionId: job.questionId },
    orderBy: [{ isSample: 'desc' }, { orderIndex: 'asc' }]
  });

  let result;
  try {
    result = await executor.executeSubmission(
      {
        code: job.code,
        language: job.language,
        timeLimitMs: job.timeLimitMs,
        memoryLimitMb: job.memoryLimitMb
      },
      testCases
    );
  } catch (err) {
    result = {
      status: 'INTERNAL_ERROR',
      compilerOutput: '',
      runtimeOutput: '',
      stderr: `[judge] executor crashed: ${err.message}`,
      exitCode: null,
      executionTime: 0,
      memoryUsed: null,
      passedTests: 0,
      totalTests: testCases.length,
      testResults: []
    };
  }

  // Persist the immutable ExecutionResult record and update the submission's status.
  const execution = await prisma.executionResult.create({
    data: {
      submissionId: job.submissionId,
      status: result.status,
      language: job.language,
      executionTime: result.executionTime ?? null,
      memoryUsed: result.memoryUsed ?? null,
      passCount: result.passedTests ?? 0,
      totalTestCases: result.totalTests ?? 0,
      compilerOutput: result.compilerOutput || null,
      runtimeOutput: result.runtimeOutput || null,
      stderr: result.stderr || null,
      exitCode: result.exitCode ?? null,
      testResults: result.testResults ?? []
    }
  });

  await prisma.submission.update({ where: { id: job.submissionId }, data: { status: result.status } });

  // Contest scoring: award the question's points on the participant's FIRST accepted
  // submission for that question (prevents double-counting on repeat submits).
  if (submission.context === 'CONTEST' && submission.contestId && result.status === 'ACCEPTED') {
    await awardContestPoints(prisma, submission);
  }

  // Question Library: keep the user's personal progress (solved/attempted, attempts, solve
  // time) in sync with their real submissions. Best-effort — never break the judge verdict.
  try {
    await recordSubmissionOutcome(prisma, {
      userId,
      questionId: job.questionId,
      status: result.status
    });
  } catch (err) {
    console.error('[library] progress update failed:', err.message);
  }

  // Final event with the verdict.
  await safePublish(publish, buildEventPayload({ submissionId: job.submissionId, userId, phase: 'COMPLETED', result }));

  return execution;
}

async function awardContestPoints(prisma, submission) {
  const priorAccepted = await prisma.submission.count({
    where: {
      contestId: submission.contestId,
      userId: submission.userId,
      questionId: submission.questionId,
      status: 'ACCEPTED',
      id: { not: submission.id }
    }
  });
  if (priorAccepted > 0) return; // already scored this question

  const contestQuestion = await prisma.contestQuestion.findFirst({
    where: { contestId: submission.contestId, questionId: submission.questionId }
  });
  const points = contestQuestion?.points ?? 100;

  await prisma.contestParticipant.updateMany({
    where: { contestId: submission.contestId, userId: submission.userId },
    data: { score: { increment: points } }
  });
}

async function safePublish(publish, payload) {
  try {
    if (publish) await publish(payload);
  } catch (err) {
    // Event delivery is best-effort; the verdict is already persisted and pollable.
    console.error('[judge] event publish failed:', err.message);
  }
}

module.exports = { processJob, awardContestPoints };
