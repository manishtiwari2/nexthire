const { prisma } = require('../../shared/db');
const { judgeQueueInstance } = require('../judge/InMemoryJudgeQueue');

// Helper to update contest status based on time
async function updateContestStatuses() {
  const now = new Date();
  await prisma.contest.updateMany({
    where: { startTime: { lte: now }, endTime: { gt: now }, status: 'UPCOMING' },
    data: { status: 'LIVE' }
  });
  await prisma.contest.updateMany({
    where: { endTime: { lte: now }, status: { in: ['UPCOMING', 'LIVE'] } },
    data: { status: 'ENDED' }
  });
}

async function getContests(req, res) {
  try {
    await updateContestStatuses();

    const contests = await prisma.contest.findMany({
      include: {
        host: { select: { id: true, name: true, email: true } },
        questions: { include: { question: true } },
        _count: { select: { participants: true } }
      },
      orderBy: { startTime: 'desc' }
    });

    res.json({ success: true, data: contests });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getContestById(req, res) {
  try {
    await updateContestStatuses();

    const contest = await prisma.contest.findUnique({
      where: { id: req.params.id },
      include: {
        host: { select: { id: true, name: true, email: true } },
        questions: { include: { question: true }, orderBy: { orderIndex: 'asc' } },
        participants: { include: { user: true }, orderBy: [{ score: 'desc' }, { penalty: 'asc' }] },
        invites: true
      }
    });

    if (!contest) {
      return res.status(404).json({ success: false, error: 'Contest not found' });
    }

    res.json({ success: true, data: contest });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function createContest(req, res) {
  try {
    const { title, description, bannerUrl, startTime, endTime, questionIds } = req.body;

    if (!title || !description) {
      return res.status(400).json({ success: false, error: 'Title and description are required' });
    }

    const start = startTime ? new Date(startTime) : new Date();
    const end = endTime ? new Date(endTime) : new Date(Date.now() + 7200000);

    const contest = await prisma.contest.create({
      data: {
        title,
        description,
        bannerUrl,
        startTime: start,
        endTime: end,
        status: start <= new Date() ? 'LIVE' : 'UPCOMING',
        hostId: req.user.id,

        questions: {
          create: Array.isArray(questionIds) ? questionIds.map((qId, index) => ({
            questionId: String(qId),
            orderIndex: index,
            points: 100
          })) : []
        }
      },
      include: { questions: { include: { question: true } } }
    });

    res.status(201).json({ success: true, data: contest });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function joinContest(req, res) {
  try {
    const contestId = req.params.id;
    const { inviteCode } = req.body;

    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) {
      return res.status(404).json({ success: false, error: 'Contest not found' });
    }

    if (contest.status === 'ENDED') {
      return res.status(400).json({ success: false, error: 'Cannot join an ended contest' });
    }

    if (inviteCode) {
      const invite = await prisma.contestInvite.findUnique({ where: { code: inviteCode } });
      if (!invite || invite.contestId !== contestId) {
        return res.status(400).json({ success: false, error: 'Invalid contest invite code' });
      }
      if (invite.maxUses && invite.usedCount >= invite.maxUses) {
        return res.status(400).json({ success: false, error: 'Invite code usage limit reached' });
      }
      await prisma.contestInvite.update({
        where: { id: invite.id },
        data: { usedCount: { increment: 1 } }
      });
    }

    const participant = await prisma.contestParticipant.upsert({
      where: { contestId_userId: { contestId, userId: req.user.id } },
      update: {
        startedAt: new Date(),
        lastHeartbeatAt: new Date()
      },
      create: {
        contestId,
        userId: req.user.id,
        startedAt: new Date(),
        lastHeartbeatAt: new Date(),
        score: 0,
        penalty: 0
      }
    });

    res.json({ success: true, data: participant });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function recordHeartbeat(req, res) {
  try {
    const contestId = req.params.id;
    const participant = await prisma.contestParticipant.update({
      where: { contestId_userId: { contestId, userId: req.user.id } },
      data: { lastHeartbeatAt: new Date() }
    });
    res.json({ success: true, data: participant });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getContestLeaderboard(req, res) {
  try {
    const contestId = req.params.id;
    const participants = await prisma.contestParticipant.findMany({
      where: { contestId, isDisqualified: false },
      include: { user: { select: { id: true, name: true, avatarUrl: true, email: true } } },
      orderBy: [{ score: 'desc' }, { penalty: 'asc' }]
    });

    // Update ranks dynamically
    const leaderboard = participants.map((p, index) => ({
      ...p,
      rank: index + 1
    }));

    res.json({ success: true, data: leaderboard });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function createContestInvite(req, res) {
  try {
    const contestId = req.params.id;
    const { maxUses, expiresAt } = req.body;
    const code = `INVITE-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    const invite = await prisma.contestInvite.create({
      data: {
        contestId,
        code,
        creatorId: req.user.id,
        maxUses: maxUses ? Number(maxUses) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      }
    });

    res.status(201).json({ success: true, data: invite });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function submitContestCode(req, res) {
  try {
    const contestId = req.params.id;
    const { questionId, code, language } = req.body;

    const participant = await prisma.contestParticipant.findUnique({
      where: { contestId_userId: { contestId, userId: req.user.id } }
    });

    if (!participant || participant.isDisqualified) {
      return res.status(403).json({ success: false, error: 'Must be an active, non-disqualified contest participant' });
    }

    const submission = await prisma.submission.create({
      data: {
        userId: req.user.id,
        questionId,
        contestId,
        context: 'CONTEST',
        code,
        language: (language || 'PYTHON').toUpperCase(),
        status: 'PENDING'
      }
    });

    const jobId = await judgeQueueInstance.enqueueJob({
      submissionId: submission.id,
      questionId,
      code,
      language: (language || 'PYTHON').toUpperCase(),
      timeLimitMs: 2000,
      memoryLimitMb: 256
    });

    // Update heartbeat (score is updated by judge worker on ACCEPTED result)
    await prisma.contestParticipant.update({
      where: { id: participant.id },
      data: { lastHeartbeatAt: new Date() }
    });

    res.json({
      success: true,
      data: {
        submissionId: submission.id,
        jobId,
        status: 'QUEUED'
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getContests,
  getContestById,
  createContest,
  joinContest,
  recordHeartbeat,
  getContestLeaderboard,
  createContestInvite,
  submitContestCode
};
