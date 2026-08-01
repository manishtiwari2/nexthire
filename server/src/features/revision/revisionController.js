const { prisma } = require('../../shared/db');
const { QUESTION_CARD_SELECT, flattenCompanies, progressMapFor, toProgressDto } = require('../library/libraryHelpers');
const { reviewQuestion, enqueueForRevision } = require('./revisionService');

function scheduleDto(r, progress) {
  return {
    questionId: r.questionId,
    nextReviewAt: r.nextReviewAt,
    intervalDays: r.intervalDays,
    easeFactor: Math.round(r.easeFactor * 100) / 100,
    reviewCount: r.reviewCount,
    lastReviewedAt: r.lastReviewedAt,
    question: { ...flattenCompanies(r.question), progress }
  };
}

// GET /revision/queue — spaced-repetition dashboard: overdue / due today / upcoming + stats.
async function getQueue(req, res) {
  try {
    const userId = req.user.id;
    const rows = await prisma.revisionSchedule.findMany({
      where: { userId },
      orderBy: { nextReviewAt: 'asc' },
      include: { question: { select: QUESTION_CARD_SELECT } }
    });

    const progressMap = await progressMapFor(prisma, userId, rows.map((r) => r.questionId));
    const toDto = (r) => scheduleDto(r, toProgressDto(progressMap.get(r.questionId)));

    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday.getTime() + 86400000 - 1);
    const now = new Date();

    const overdue = [];
    const dueToday = [];
    const upcoming = [];
    for (const r of rows) {
      const t = new Date(r.nextReviewAt);
      if (t < startOfToday) overdue.push(toDto(r));
      else if (t <= endOfToday) dueToday.push(toDto(r));
      else upcoming.push(toDto(r));
    }

    const dueCount = rows.filter((r) => new Date(r.nextReviewAt) <= now).length;
    const avgEase = rows.length ? rows.reduce((s, r) => s + r.easeFactor, 0) / rows.length : 0;

    res.json({
      success: true,
      data: {
        overdue,
        dueToday,
        upcoming: upcoming.slice(0, 30),
        stats: {
          totalTracked: rows.length,
          dueCount,
          overdueCount: overdue.length,
          dueTodayCount: dueToday.length,
          upcomingCount: upcoming.length,
          avgEase: Math.round(avgEase * 100) / 100,
          // Ease 1.3 → 0%, 3.0 → 100%; a rough "how well do you know these" gauge.
          confidence: rows.length ? Math.round(Math.max(0, Math.min(1, (avgEase - 1.3) / 1.7)) * 100) : 0
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /revision/review { questionId, quality } — grade a review and reschedule.
async function review(req, res) {
  try {
    const userId = req.user.id;
    const { questionId } = req.body;
    const quality = Number(req.body.quality);
    if (!questionId || !Number.isFinite(quality)) {
      return res.status(400).json({ success: false, error: 'questionId and numeric quality (0–5) are required' });
    }
    const row = await reviewQuestion(prisma, { userId, questionId, quality });
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /revision/enqueue { questionId, dueInDays? } — manually add a question to the ladder.
async function enqueue(req, res) {
  try {
    const userId = req.user.id;
    const { questionId } = req.body;
    if (!questionId) return res.status(400).json({ success: false, error: 'questionId is required' });
    const dueInDays = Number.isFinite(Number(req.body.dueInDays)) ? Number(req.body.dueInDays) : 1;
    const row = await enqueueForRevision(prisma, { userId, questionId, dueInDays });
    res.json({ success: true, data: row });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /revision/:questionId — remove a question from the ladder.
async function remove(req, res) {
  try {
    const userId = req.user.id;
    await prisma.revisionSchedule.deleteMany({ where: { userId, questionId: req.params.questionId } });
    res.json({ success: true, data: { removed: true } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { getQueue, review, enqueue, remove };
