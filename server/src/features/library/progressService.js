// Per-user progress tracking for the Question Library.
//
// This is called from the judge processor whenever a submission is judged, so a user's
// solved/attempted state and stats stay in sync with their real submissions. It is written
// to be safe when handed a *fake* prisma (unit tests inject one without library models):
// if the progress model is absent it no-ops, and it never throws into the judge path.

/**
 * Record the outcome of a judged submission against the user's progress for a question.
 * Idempotently upserts UserQuestionProgress: bumps attempts, flips status, and — on the
 * first accepted submission — records firstSolvedAt and a "time to first solve" sample.
 *
 * @param {object} prisma  Prisma client (real one from shared/db)
 * @param {{userId:string, questionId:string, status:string}} outcome  status = SubmissionStatus
 */
async function recordSubmissionOutcome(prisma, { userId, questionId, status }) {
  if (!prisma || !prisma.userQuestionProgress || !userId || !questionId) return;

  const accepted = status === 'ACCEPTED';
  const now = new Date();
  const key = { userId_questionId: { userId, questionId } };

  const existing = await prisma.userQuestionProgress.findUnique({ where: key });

  if (!existing) {
    await prisma.userQuestionProgress.create({
      data: {
        userId,
        questionId,
        status: accepted ? 'SOLVED' : 'ATTEMPTED',
        attempts: 1,
        acceptedCount: accepted ? 1 : 0,
        firstSolvedAt: accepted ? now : null,
        lastPracticedAt: now
      }
    });
    return;
  }

  const data = {
    attempts: { increment: 1 },
    lastPracticedAt: now
  };

  if (accepted) {
    data.acceptedCount = { increment: 1 };
    if (existing.status !== 'SOLVED') data.status = 'SOLVED';
    if (!existing.firstSolvedAt) {
      // "Average solve time" is interpreted as time from first interaction to first solve.
      const solveSec = Math.max(0, Math.round((now.getTime() - new Date(existing.createdAt).getTime()) / 1000));
      data.firstSolvedAt = now;
      data.totalSolveSec = { increment: solveSec };
      data.solveSessions = { increment: 1 };
    }
  } else if (existing.status === 'TODO') {
    data.status = 'ATTEMPTED';
  }

  await prisma.userQuestionProgress.update({ where: key, data });
}

module.exports = { recordSubmissionOutcome };
