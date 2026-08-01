const { prisma } = require('../../shared/db');
const { slugify } = require('./libraryHelpers');

// GET /library/collections/companies — company tags with question counts (+ solved when authed).
async function companies(req, res) {
  try {
    const rows = await prisma.companyTag.findMany({
      include: { _count: { select: { questions: true } } },
      orderBy: { name: 'asc' }
    });

    let solvedByCompany = new Map();
    if (req.user?.id) {
      // Count the user's solved questions per company in one pass.
      const maps = await prisma.companyTagMap.findMany({
        where: { question: { progress: { some: { userId: req.user.id, status: 'SOLVED' } } } },
        select: { companyTagId: true }
      });
      for (const m of maps) solvedByCompany.set(m.companyTagId, (solvedByCompany.get(m.companyTagId) || 0) + 1);
    }

    const data = rows.map((c) => ({
      id: c.id,
      name: c.name,
      slug: slugify(c.name),
      total: c._count.questions,
      solvedCount: solvedByCompany.get(c.id) || 0
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /library/collections/topics — topics with question counts (+ solved when authed).
async function topics(req, res) {
  try {
    const rows = await prisma.topic.findMany({
      include: { _count: { select: { questions: true } } },
      orderBy: { name: 'asc' }
    });

    let solvedByTopic = new Map();
    if (req.user?.id) {
      const solved = await prisma.userQuestionProgress.findMany({
        where: { userId: req.user.id, status: 'SOLVED' },
        select: { question: { select: { topicId: true } } }
      });
      for (const s of solved) {
        const tid = s.question?.topicId;
        if (tid) solvedByTopic.set(tid, (solvedByTopic.get(tid) || 0) + 1);
      }
    }

    const data = rows.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      total: t._count.questions,
      solvedCount: solvedByTopic.get(t.id) || 0
    }));

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /library/collections/sources — question counts grouped by source platform.
async function sources(req, res) {
  try {
    const grouped = await prisma.question.groupBy({
      by: ['sourcePlatform'],
      _count: { _all: true }
    });
    const data = grouped
      .map((g) => ({ platform: g.sourcePlatform, total: g._count._all }))
      .sort((a, b) => b.total - a.total);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { companies, topics, sources };
