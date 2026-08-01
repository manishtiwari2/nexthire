const { prisma } = require('../../shared/db');
const { QUESTION_CARD_SELECT, flattenCompanies, toProgressDto } = require('./libraryHelpers');

// GET /library/progress — the caller's tracked questions (optionally filtered by status/bookmark).
async function listProgress(req, res) {
  try {
    const userId = req.user.id;
    const { status, bookmarked } = req.query;

    const where = { userId };
    if (status) where.status = String(status).toUpperCase();
    if (bookmarked === 'true') where.isBookmarked = true;

    const rows = await prisma.userQuestionProgress.findMany({
      where,
      orderBy: { lastPracticedAt: 'desc' },
      include: { question: { select: QUESTION_CARD_SELECT } }
    });

    const data = rows.map((r) => ({
      question: flattenCompanies(r.question),
      progress: toProgressDto(r)
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /library/progress/stats — dashboard aggregates for the caller.
async function getStats(req, res) {
  try {
    const userId = req.user.id;

    const rows = await prisma.userQuestionProgress.findMany({
      where: { userId },
      include: { question: { select: { difficulty: true, topic: { select: { id: true, name: true, slug: true } } } } }
    });

    const totalQuestions = await prisma.question.count();

    const byDifficulty = { EASY: 0, MEDIUM: 0, HARD: 0 };
    const totalByDifficulty = { EASY: 0, MEDIUM: 0, HARD: 0 };
    const solved = rows.filter((r) => r.status === 'SOLVED');
    const attempted = rows.filter((r) => r.status === 'ATTEMPTED');

    for (const r of solved) {
      const d = r.question?.difficulty;
      if (d && byDifficulty[d] !== undefined) byDifficulty[d] += 1;
    }

    // Total questions per difficulty (denominators for the progress bars).
    const diffCounts = await prisma.question.groupBy({ by: ['difficulty'], _count: { _all: true } });
    for (const g of diffCounts) totalByDifficulty[g.difficulty] = g._count._all;

    // Per-topic attempted vs solved → weak topics = attempted the most but solved the least.
    const topicMap = new Map();
    for (const r of rows) {
      const t = r.question?.topic;
      if (!t) continue;
      const entry = topicMap.get(t.id) || { id: t.id, name: t.name, slug: t.slug, seen: 0, solved: 0 };
      entry.seen += 1;
      if (r.status === 'SOLVED') entry.solved += 1;
      topicMap.set(t.id, entry);
    }
    const weakTopics = [...topicMap.values()]
      .map((t) => ({ ...t, solveRate: t.seen ? t.solved / t.seen : 0, unsolved: t.seen - t.solved }))
      .filter((t) => t.unsolved > 0)
      .sort((a, b) => a.solveRate - b.solveRate || b.unsolved - a.unsolved)
      .slice(0, 6);

    // Average solve time across solved questions that have a timed sample.
    const timed = rows.filter((r) => r.solveSessions > 0);
    const avgSolveSec = timed.length
      ? Math.round(timed.reduce((s, r) => s + r.totalSolveSec / r.solveSessions, 0) / timed.length)
      : null;

    const revisionDue = await prisma.revisionSchedule.count({
      where: { userId, nextReviewAt: { lte: new Date() } }
    });

    const recent = rows
      .filter((r) => r.lastPracticedAt)
      .sort((a, b) => new Date(b.lastPracticedAt) - new Date(a.lastPracticedAt))
      .slice(0, 8)
      .map((r) => ({ questionId: r.questionId, status: r.status, lastPracticedAt: r.lastPracticedAt }));

    res.json({
      success: true,
      data: {
        totalQuestions,
        solvedTotal: solved.length,
        attemptedTotal: attempted.length,
        bookmarkedTotal: rows.filter((r) => r.isBookmarked).length,
        byDifficulty,
        totalByDifficulty,
        weakTopics,
        avgSolveSec,
        revisionDue,
        recent
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /library/progress/activity — submission heatmap + streaks for the dashboard.
// Buckets the caller's submissions by UTC day over the last ~26 weeks and derives
// current/longest streaks plus rolling week/month totals. No new tables needed.
async function getActivity(req, res) {
  try {
    const userId = req.user.id;
    const WINDOW_DAYS = 182; // 26 weeks — enough for a GitHub-style heatmap.

    const iso = (d) => d.toISOString().slice(0, 10);
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (WINDOW_DAYS - 1));

    const subs = await prisma.submission.findMany({
      where: { userId, createdAt: { gte: since } },
      select: { createdAt: true }
    });

    // Count submissions per UTC day.
    const calendar = {};
    for (const s of subs) {
      const key = iso(new Date(s.createdAt));
      calendar[key] = (calendar[key] || 0) + 1;
    }

    // Current streak: consecutive active days ending today (with a one-day grace
    // so an unfinished today doesn't visually break the streak).
    let currentStreak = 0;
    const cursor = new Date();
    cursor.setUTCHours(0, 0, 0, 0);
    if (!calendar[iso(cursor)]) cursor.setUTCDate(cursor.getUTCDate() - 1);
    while (calendar[iso(cursor)]) {
      currentStreak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }

    // Longest streak within the window.
    const activeDays = Object.keys(calendar).sort();
    let longestStreak = 0;
    let run = 0;
    let prev = null;
    for (const day of activeDays) {
      if (prev) {
        const gap = (new Date(day) - new Date(prev)) / 86400000;
        run = gap === 1 ? run + 1 : 1;
      } else {
        run = 1;
      }
      if (run > longestStreak) longestStreak = run;
      prev = day;
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const daysAgo = (n) => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - n);
      return iso(d);
    };
    let weekCount = 0;
    let monthCount = 0;
    for (let i = 0; i < 30; i += 1) {
      const c = calendar[daysAgo(i)] || 0;
      if (i < 7) weekCount += c;
      monthCount += c;
    }

    res.json({
      success: true,
      data: {
        calendar,
        currentStreak,
        longestStreak,
        todayCount: calendar[iso(today)] || 0,
        weekCount,
        monthCount,
        totalActiveDays: activeDays.length,
        totalSubmissions: subs.length,
        windowDays: WINDOW_DAYS
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// PATCH /library/progress/:questionId — manually set status (TODO/ATTEMPTED/SOLVED).
async function setStatus(req, res) {
  try {
    const userId = req.user.id;
    const questionId = req.params.questionId;
    const status = String(req.body.status || '').toUpperCase();
    if (!['TODO', 'ATTEMPTED', 'SOLVED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'status must be TODO, ATTEMPTED, or SOLVED' });
    }

    const now = new Date();
    const existing = await prisma.userQuestionProgress.findUnique({
      where: { userId_questionId: { userId, questionId } }
    });
    const markSolved = status === 'SOLVED' && (!existing || !existing.firstSolvedAt);

    const row = await prisma.userQuestionProgress.upsert({
      where: { userId_questionId: { userId, questionId } },
      update: { status, lastPracticedAt: now, ...(markSolved && { firstSolvedAt: now }) },
      create: { userId, questionId, status, lastPracticedAt: now, ...(status === 'SOLVED' && { firstSolvedAt: now }) }
    });

    res.json({ success: true, data: toProgressDto(row) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /library/progress/:questionId/bookmark — toggle (or set explicit) bookmark state.
async function toggleBookmark(req, res) {
  try {
    const userId = req.user.id;
    const questionId = req.params.questionId;

    const existing = await prisma.userQuestionProgress.findUnique({
      where: { userId_questionId: { userId, questionId } }
    });
    const next = typeof req.body.bookmarked === 'boolean' ? req.body.bookmarked : !(existing?.isBookmarked);

    const row = await prisma.userQuestionProgress.upsert({
      where: { userId_questionId: { userId, questionId } },
      update: { isBookmarked: next },
      create: { userId, questionId, isBookmarked: next, status: 'TODO' }
    });

    res.json({ success: true, data: toProgressDto(row) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { listProgress, getStats, getActivity, setStatus, toggleBookmark };
