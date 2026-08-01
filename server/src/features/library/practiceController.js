const { prisma } = require('../../shared/db');
const { QUESTION_CARD_SELECT, flattenCompanies, progressMapFor, toProgressDto } = require('./libraryHelpers');

// Only surface real, solvable content in practice modes (external references have no local judge).
const PRACTICE_BASE = { contentStatus: 'PUBLISHED' };

function difficultyFilter(query) {
  const d = query.difficulty ? String(query.difficulty).toUpperCase() : null;
  return d && ['EASY', 'MEDIUM', 'HARD'].includes(d) ? { difficulty: d } : {};
}

async function attachProgress(req, questions) {
  const map = await progressMapFor(prisma, req.user?.id, questions.map((q) => q.id));
  return questions.map((q) => ({ ...flattenCompanies(q), progress: toProgressDto(map.get(q.id)) }));
}

// Pick `take` random questions matching `where` (uniform-ish via random skips, dedup).
async function pickRandom(where, take) {
  const total = await prisma.question.count({ where });
  if (total === 0) return [];
  const wanted = Math.min(take, total);
  const offsets = new Set();
  while (offsets.size < wanted) offsets.add(Math.floor(Math.random() * total));
  const picks = await Promise.all(
    [...offsets].map((skip) =>
      prisma.question.findFirst({ where, skip, orderBy: { id: 'asc' }, select: QUESTION_CARD_SELECT })
    )
  );
  return picks.filter(Boolean);
}

// GET /library/practice/random
async function random(req, res) {
  try {
    const where = { ...PRACTICE_BASE, isExternalOnly: false, ...difficultyFilter(req.query) };
    if (req.query.topicSlug) where.topic = { slug: String(req.query.topicSlug) };
    const count = Math.max(1, Math.min(20, parseInt(req.query.count) || 1));
    const questions = await pickRandom(where, count);
    res.json({ success: true, data: await attachProgress(req, questions) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /library/practice/daily — same question for everyone on a given date (deterministic).
async function daily(req, res) {
  try {
    const where = { ...PRACTICE_BASE, isExternalOnly: false };
    const total = await prisma.question.count({ where });
    if (total === 0) return res.json({ success: true, data: null });

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    let hash = 0;
    for (let i = 0; i < today.length; i += 1) hash = (hash * 31 + today.charCodeAt(i)) >>> 0;
    const skip = hash % total;

    const q = await prisma.question.findFirst({ where, skip, orderBy: { id: 'asc' }, select: QUESTION_CARD_SELECT });
    const [withProgress] = await attachProgress(req, q ? [q] : []);
    res.json({ success: true, data: { date: today, question: withProgress || null } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /library/practice/topic/:slug
async function byTopic(req, res) {
  try {
    const where = { ...PRACTICE_BASE, topic: { slug: req.params.slug } };
    const questions = await prisma.question.findMany({
      where,
      orderBy: [{ frequencyBand: 'desc' }, { difficulty: 'asc' }],
      take: 50,
      select: QUESTION_CARD_SELECT
    });
    res.json({ success: true, data: await attachProgress(req, questions) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /library/practice/company/:slug (company tag matched by slugified name)
async function byCompany(req, res) {
  try {
    const target = String(req.params.slug).toLowerCase();
    const companies = await prisma.companyTag.findMany();
    const match = companies.find((c) => c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === target);
    if (!match) return res.json({ success: true, data: [] });

    const questions = await prisma.question.findMany({
      where: { ...PRACTICE_BASE, companyTags: { some: { companyTagId: match.id } } },
      orderBy: [{ frequencyBand: 'desc' }, { difficulty: 'asc' }],
      take: 50,
      select: QUESTION_CARD_SELECT
    });
    res.json({ success: true, data: { company: match.name, questions: await attachProgress(req, questions) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /library/practice/revision-queue — spaced-repetition items due now (auth required).
async function revisionQueue(req, res) {
  try {
    const due = await prisma.revisionSchedule.findMany({
      where: { userId: req.user.id, nextReviewAt: { lte: new Date() } },
      orderBy: { nextReviewAt: 'asc' },
      include: { question: { select: QUESTION_CARD_SELECT } },
      take: 50
    });
    const data = due.map((r) => ({
      nextReviewAt: r.nextReviewAt,
      intervalDays: r.intervalDays,
      reviewCount: r.reviewCount,
      question: flattenCompanies(r.question)
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /library/practice/weak-topics — questions from topics the user solves least (auth required).
async function weakTopics(req, res) {
  try {
    const userId = req.user.id;
    const progress = await prisma.userQuestionProgress.findMany({
      where: { userId },
      include: { question: { select: { topicId: true } } }
    });

    const byTopicId = new Map();
    for (const p of progress) {
      const tid = p.question?.topicId;
      if (!tid) continue;
      const e = byTopicId.get(tid) || { seen: 0, solved: 0 };
      e.seen += 1;
      if (p.status === 'SOLVED') e.solved += 1;
      byTopicId.set(tid, e);
    }

    const weakIds = [...byTopicId.entries()]
      .map(([id, e]) => ({ id, rate: e.seen ? e.solved / e.seen : 0, unsolved: e.seen - e.solved }))
      .filter((t) => t.unsolved > 0)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 3)
      .map((t) => t.id);

    // Fall back to hardest topics overall if the user has no history yet.
    const topicWhere = weakIds.length ? { topicId: { in: weakIds } } : {};
    const solvedIds = new Set(progress.filter((p) => p.status === 'SOLVED').map((p) => p.questionId));

    const questions = await prisma.question.findMany({
      where: { ...PRACTICE_BASE, ...topicWhere, id: { notIn: [...solvedIds] } },
      orderBy: [{ difficulty: 'desc' }],
      take: 20,
      select: QUESTION_CARD_SELECT
    });

    res.json({ success: true, data: await attachProgress(req, questions) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /library/practice/mixed — a mixed-difficulty interview set.
async function mixed(req, res) {
  try {
    const count = Math.max(2, Math.min(10, parseInt(req.query.count) || 5));
    const base = { ...PRACTICE_BASE, isExternalOnly: false };
    // Roughly 40% easy, 40% medium, 20% hard.
    const easy = await pickRandom({ ...base, difficulty: 'EASY' }, Math.ceil(count * 0.4));
    const medium = await pickRandom({ ...base, difficulty: 'MEDIUM' }, Math.ceil(count * 0.4));
    const hard = await pickRandom({ ...base, difficulty: 'HARD' }, Math.max(1, Math.floor(count * 0.2)));
    const set = [...easy, ...medium, ...hard].slice(0, count);
    res.json({ success: true, data: await attachProgress(req, set) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /library/practice/mock — a timed mock interview set with a suggested time budget.
async function mock(req, res) {
  try {
    const count = Math.max(1, Math.min(6, parseInt(req.body.count) || 3));
    const base = { ...PRACTICE_BASE, isExternalOnly: false };
    const difficulty = req.body.difficulty ? String(req.body.difficulty).toUpperCase() : null;
    const where = difficulty && ['EASY', 'MEDIUM', 'HARD'].includes(difficulty) ? { ...base, difficulty } : base;

    const questions = await pickRandom(where, count);
    const withProgress = await attachProgress(req, questions);
    const budgetMin = withProgress.reduce((s, q) => s + (q.estimatedTimeMin || 30), 0);

    res.json({ success: true, data: { budgetMin, questions: withProgress } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { random, daily, byTopic, byCompany, revisionQueue, weakTopics, mixed, mock };
