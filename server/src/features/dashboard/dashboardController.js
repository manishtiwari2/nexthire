const { prisma } = require('../../shared/db');

async function getDashboardStats(req, res) {
  try {
    const userId = req.user.id;

    const [totalSubmissions, acceptedSubmissions, uniqueQuestionsSolved, activeContestsCount, dueRevisionsCount, recentSubmissions] = await Promise.all([
      prisma.submission.count({ where: { userId } }),
      prisma.submission.count({ where: { userId, status: 'ACCEPTED' } }),
      prisma.submission.groupBy({ by: ['questionId'], where: { userId, status: 'ACCEPTED' } }),
      prisma.contestParticipant.count({ where: { userId } }),
      prisma.revisionSchedule.count({ where: { userId, nextReviewAt: { lte: new Date() } } }),
      prisma.submission.findMany({ where: { userId }, take: 5, include: { question: true, executions: { take: 1, orderBy: { judgedAt: 'desc' } } }, orderBy: { createdAt: 'desc' } })
    ]);

    const passRate = totalSubmissions > 0 ? ((acceptedSubmissions / totalSubmissions) * 100).toFixed(1) : '0.0';

    res.json({
      success: true,
      data: {
        problemsSolved: uniqueQuestionsSolved.length,
        totalSubmissions,
        passRate: parseFloat(passRate),
        contestsEntered: activeContestsCount,
        dueRevisions: dueRevisionsCount,
        recentSubmissions
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { getDashboardStats };
