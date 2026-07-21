const { prisma } = require('../../shared/db');

async function getInterviews(req, res) {
  try {
    const interviews = await prisma.interview.findMany({
      where: {
        OR: [
          { hostId: req.user.id },
          { participants: { some: { userId: req.user.id } } }
        ]
      },
      include: {
        host: { select: { id: true, name: true, email: true } },
        participants: { include: { user: true } },
        problem: true,
        report: true
      },
      orderBy: { scheduledAt: 'desc' }
    });
    res.json({ success: true, data: interviews });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getInterviewById(req, res) {
  try {
    const interview = await prisma.interview.findUnique({
      where: { id: req.params.id },
      include: {
        host: { select: { id: true, name: true, email: true } },
        participants: { include: { user: true } },
        problem: { include: { starterCodes: true, testCases: { where: { isSample: true } } } },
        report: true
      }
    });

    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview session not found' });
    }

    res.json({ success: true, data: interview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function scheduleInterview(req, res) {
  try {
    const { candidateId, position, scheduledAt, problemId } = req.body;
    const roomCode = `NH-LIVE-${Math.floor(1000 + Math.random() * 9000)}`;

    const interview = await prisma.interview.create({
      data: {
        roomCode,
        position: position || 'Senior Software Engineer',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(Date.now() + 86400000),
        status: 'SCHEDULED',
        hostId: req.user.id,
        problemId: problemId || null,
        participants: {
          create: [
            { userId: req.user.id, role: 'INTERVIEWER', joinedAt: new Date() },
            ...(candidateId ? [{ userId: candidateId, role: 'CANDIDATE' }] : [])
          ]
        }
      },
      include: { participants: true }
    });

    res.status(201).json({ success: true, data: interview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function createInterviewReport(req, res) {
  try {
    const { overallScore, problemSolvingScore, codeQualityScore, communicationScore, systemDesignScore, feedback, strengths, improvements } = req.body;

    const report = await prisma.interviewReport.create({
      data: {
        interviewId: req.params.id,
        overallScore: Number(overallScore) || 92,
        problemSolvingScore: Number(problemSolvingScore) || 95,
        codeQualityScore: Number(codeQualityScore) || 92,
        communicationScore: Number(communicationScore) || 96,
        systemDesignScore: Number(systemDesignScore) || 90,
        feedback: feedback || 'Solid performance across coding and communication.',
        strengths: strengths || 'Clean function modularization and edge case testing.',
        improvements: improvements || 'Further optimize memory usage for large stream buffers.'
      }
    });

    await prisma.interview.update({
      where: { id: req.params.id },
      data: { status: 'COMPLETED' }
    });

    res.status(201).json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getInterviews,
  getInterviewById,
  scheduleInterview,
  createInterviewReport
};
