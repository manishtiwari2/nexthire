const { prisma } = require('../../shared/db');

async function getDueRevisions(req, res) {
  try {
    const dueRevisions = await prisma.revisionSchedule.findMany({
      where: {
        userId: req.user.id,
        nextReviewAt: { lte: new Date() }
      },
      include: { question: { include: { topic: true } } },
      orderBy: { nextReviewAt: 'asc' }
    });

    res.json({ success: true, data: dueRevisions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function updateRevisionReview(req, res) {
  try {
    const { questionId, quality } = req.body; // quality 0 to 5 (SM-2)
    const q = Math.max(0, Math.min(5, Number(quality) || 3));

    let revision = await prisma.revisionSchedule.findUnique({
      where: { userId_questionId: { userId: req.user.id, questionId } }
    });

    let interval = 1;
    let easeFactor = 2.5;
    let reviewCount = 0;

    if (revision) {
      reviewCount = revision.reviewCount + 1;
      easeFactor = Math.max(1.3, revision.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

      if (q < 3) {
        interval = 1;
      } else {
        if (reviewCount === 1) interval = 1;
        else if (reviewCount === 2) interval = 6;
        else interval = Math.round(revision.intervalDays * easeFactor);
      }
    } else {
      reviewCount = 1;
      interval = 1;
    }

    const nextReviewAt = new Date(Date.now() + interval * 86400000);

    const updated = await prisma.revisionSchedule.upsert({
      where: { userId_questionId: { userId: req.user.id, questionId } },
      update: {
        intervalDays: interval,
        easeFactor,
        reviewCount,
        lastReviewedAt: new Date(),
        nextReviewAt
      },
      create: {
        userId: req.user.id,
        questionId,
        intervalDays: interval,
        easeFactor,
        reviewCount: 1,
        lastReviewedAt: new Date(),
        nextReviewAt
      }
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { getDueRevisions, updateRevisionReview };
