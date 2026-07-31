const { prisma } = require('../../shared/db');
const { judgeQueueInstance } = require('../judge/judgeQueue');
const { dispatchJudgeJob, isInlineMode } = require('../judge/judgeDispatch');
const { buildSubmissionDto, buildExecutionDto } = require('./submissionDto');

// GET /submissions/:id — a submission with its latest execution result.
async function getSubmission(req, res) {
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: { executions: { orderBy: { judgedAt: 'desc' }, take: 1 } }
    });
    if (!submission) return res.status(404).json({ success: false, error: 'Submission not found' });

    const isAdmin = req.user.role === 'ADMIN';
    if (submission.userId !== req.user.id && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Not authorized to view this submission' });
    }

    res.json({ success: true, data: buildSubmissionDto(submission, { isAdmin }) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /submissions/:id/result — just the latest execution result DTO.
async function getExecutionResult(req, res) {
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: { executions: { orderBy: { judgedAt: 'desc' }, take: 1 } }
    });
    if (!submission) return res.status(404).json({ success: false, error: 'Submission not found' });

    const isAdmin = req.user.role === 'ADMIN';
    if (submission.userId !== req.user.id && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Not authorized to view this result' });
    }

    const execution = submission.executions[0];
    if (!execution) {
      // Judged asynchronously — no result yet.
      return res.json({ success: true, data: { status: submission.status, pending: true } });
    }
    res.json({ success: true, data: buildExecutionDto(execution, { isAdmin }) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /submissions?questionId=&userId=&limit= — submission history.
// A user only ever sees their own submissions; an admin may filter by userId.
async function listSubmissions(req, res) {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit, 10) || 20));

    const where = {};
    if (req.query.questionId) where.questionId = String(req.query.questionId);
    if (req.query.contestId) where.contestId = String(req.query.contestId);
    where.userId = isAdmin && req.query.userId ? String(req.query.userId) : req.user.id;

    const submissions = await prisma.submission.findMany({
      where,
      include: { executions: { orderBy: { judgedAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'desc' },
      take: limit
    });

    res.json({ success: true, data: submissions.map((s) => buildSubmissionDto(s, { isAdmin })) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /submissions/:id/rejudge — ADMIN only (enforced by route middleware).
async function rejudgeSubmission(req, res) {
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: { question: { select: { timeLimitMs: true, memoryLimitMb: true } } }
    });
    if (!submission) return res.status(404).json({ success: false, error: 'Submission not found' });

    await prisma.submission.update({ where: { id: submission.id }, data: { status: 'PENDING' } });

    const jobId = await dispatchJudgeJob({
      submissionId: submission.id,
      questionId: submission.questionId,
      code: submission.code,
      language: submission.language,
      timeLimitMs: submission.question?.timeLimitMs,
      memoryLimitMb: submission.question?.memoryLimitMb
    });

    res.json({ success: true, data: { submissionId: submission.id, jobId, status: 'QUEUED' } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /submissions/:id/cancel — cancel a submission still waiting in the queue.
async function cancelSubmission(req, res) {
  try {
    const submission = await prisma.submission.findUnique({ where: { id: req.params.id } });
    if (!submission) return res.status(404).json({ success: false, error: 'Submission not found' });

    if (submission.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Not authorized to cancel this submission' });
    }
    if (submission.status !== 'PENDING') {
      return res.status(409).json({ success: false, error: `Cannot cancel a submission in status ${submission.status}` });
    }

    // In inline mode there is no queue to remove from (jobs run synchronously), so skip it.
    const cancelled = isInlineMode() ? false : await judgeQueueInstance.cancelJob(submission.id);
    await prisma.submission.update({ where: { id: submission.id }, data: { status: 'CANCELLED' } });

    res.json({ success: true, data: { submissionId: submission.id, status: 'CANCELLED', removedFromQueue: cancelled } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getSubmission,
  getExecutionResult,
  listSubmissions,
  rejudgeSubmission,
  cancelSubmission
};
