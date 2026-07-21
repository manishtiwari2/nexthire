const { prisma } = require('../../shared/db');
const { judgeQueueInstance } = require('../judge/InMemoryJudgeQueue');

async function getQuestions(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const { search, difficulty, topicId, tagId } = req.query;
    const where = {};

    if (search) {
      where.OR = [
        { title: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } }
      ];
    }
    if (difficulty) {
      where.difficulty = String(difficulty).toUpperCase();
    }
    if (topicId) {
      where.topicId = String(topicId);
    }
    if (tagId) {
      where.questionTags = { some: { tagId: String(tagId) } };
    }

    const [total, questions] = await Promise.all([
      prisma.question.count({ where }),
      prisma.question.findMany({
        where,
        skip,
        take: limit,
        include: {
          topic: true,
          starterCodes: true,
          testCases: { where: { isSample: true } },
          hints: true,
          questionTags: { include: { tag: true } },
          companyTags: { include: { companyTag: true } }
        },
        orderBy: { createdAt: 'desc' }
      })
    ]);

    res.json({
      success: true,
      data: questions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getQuestionById(req, res) {
  try {
    const question = await prisma.question.findUnique({
      where: { id: req.params.id },
      include: {
        topic: true,
        starterCodes: true,
        testCases: true,
        hints: { orderBy: { orderIndex: 'asc' } },
        editorial: true,
        questionTags: { include: { tag: true } },
        companyTags: { include: { companyTag: true } }
      }
    });

    if (!question) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    res.json({ success: true, data: question });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function createQuestion(req, res) {
  try {
    const {
      title,
      difficulty,
      topicName,
      description,
      constraints,
      timeLimitMs,
      memoryLimitMb,
      starterCodes,
      testCases,
      hints,
      editorialContent,
      editorialSolution
    } = req.body;

    const slug = (title || 'question').toLowerCase().replace(/[^a-z0-9]+/g, '-');

    let topic = await prisma.topic.findFirst({ where: { name: topicName || 'Algorithms' } });
    if (!topic) {
      topic = await prisma.topic.create({
        data: {
          name: topicName || 'Algorithms',
          slug: (topicName || 'algorithms').toLowerCase().replace(/[^a-z0-9]+/g, '-')
        }
      });
    }

    const question = await prisma.question.create({
      data: {
        title,
        slug: `${slug}-${Date.now().toString().slice(-4)}`,
        difficulty: difficulty || 'EASY',
        topicId: topic.id,
        description: description || 'Problem description.',
        constraints: constraints || '1 <= N <= 10^5',
        timeLimitMs: Number(timeLimitMs) || 2000,
        memoryLimitMb: Number(memoryLimitMb) || 256,

        starterCodes: {
          create: Array.isArray(starterCodes) ? starterCodes : [
            { language: 'PYTHON', template: 'def solution():\n    pass' },
            { language: 'JAVASCRIPT', template: 'function solution() {\n}' }
          ]
        },

        testCases: {
          create: Array.isArray(testCases) ? testCases : [
            { input: '1, 2', expectedOutput: '3', isSample: true, orderIndex: 0 }
          ]
        },

        hints: {
          create: Array.isArray(hints) ? hints.map((h, i) => ({ content: h.content || h, orderIndex: i })) : []
        },

        ...(editorialContent ? {
          editorial: {
            create: {
              content: editorialContent,
              solution: editorialSolution || ''
            }
          }
        } : {})
      },
      include: {
        topic: true,
        starterCodes: true,
        testCases: true,
        hints: true,
        editorial: true
      }
    });

    res.status(201).json({ success: true, data: question });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function updateQuestion(req, res) {
  try {
    const { title, difficulty, description, constraints } = req.body;
    const question = await prisma.question.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title }),
        ...(difficulty && { difficulty }),
        ...(description && { description }),
        ...(constraints && { constraints })
      },
      include: { topic: true, starterCodes: true, testCases: true }
    });

    res.json({ success: true, data: question });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function deleteQuestion(req, res) {
  try {
    await prisma.question.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Question deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function submitCodeExecution(req, res) {
  try {
    const { code, language, context, contestId, interviewId } = req.body;
    const questionId = req.params.id;

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    const submission = await prisma.submission.create({
      data: {
        userId: req.user.id,
        questionId: question.id,
        context: context || 'PRACTICE',
        contestId: contestId || null,
        interviewId: interviewId || null,
        code,
        language: (language || 'PYTHON').toUpperCase(),
        status: 'PENDING'
      }
    });

    const jobId = await judgeQueueInstance.enqueueJob({
      submissionId: submission.id,
      questionId: question.id,
      code,
      language: (language || 'PYTHON').toUpperCase(),
      timeLimitMs: question.timeLimitMs,
      memoryLimitMb: question.memoryLimitMb
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

async function getSubmissionResult(req, res) {
  try {
    const submission = await prisma.submission.findUnique({
      where: { id: req.params.submissionId },
      include: { executions: true, question: true }
    });

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    res.json({ success: true, data: submission });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getUserSubmissionsForQuestion(req, res) {
  try {
    const questionId = req.params.id;
    const submissions = await prisma.submission.findMany({
      where: {
        questionId,
        userId: req.user.id
      },
      include: { executions: { take: 1, orderBy: { judgedAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    res.json({ success: true, data: submissions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getTopics(req, res) {
  try {
    const topics = await prisma.topic.findMany({
      include: { _count: { select: { questions: true } } }
    });
    res.json({ success: true, data: topics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getQuestions,
  getQuestionById,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  submitCodeExecution,
  getSubmissionResult,
  getUserSubmissionsForQuestion,
  getTopics
};
