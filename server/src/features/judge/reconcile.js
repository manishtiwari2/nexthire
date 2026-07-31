// Crash-recovery safety net.
//
// BullMQ + Redis already persist queued jobs across restarts, but a submission could be
// created and left PENDING if the process died between the DB write and the enqueue. On API
// boot we re-enqueue anything still PENDING so no submission is silently lost.

const { prisma } = require('../../shared/db');
const { dispatchJudgeJob } = require('./judgeDispatch');

async function reconcilePendingSubmissions() {
  const pending = await prisma.submission.findMany({
    where: { status: 'PENDING' },
    include: { question: { select: { timeLimitMs: true, memoryLimitMb: true } } },
    take: 500
  });

  let requeued = 0;
  for (const s of pending) {
    try {
      await dispatchJudgeJob({
        submissionId: s.id,
        questionId: s.questionId,
        code: s.code,
        language: s.language,
        timeLimitMs: s.question?.timeLimitMs,
        memoryLimitMb: s.question?.memoryLimitMb
      });
      requeued++;
    } catch (err) {
      console.error(`[judge] failed to re-enqueue submission ${s.id}:`, err.message);
    }
  }

  if (requeued > 0) console.log(`[judge] reconciled ${requeued} pending submission(s) into the queue`);
  return requeued;
}

module.exports = { reconcilePendingSubmissions };
