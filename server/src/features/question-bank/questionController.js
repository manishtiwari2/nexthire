const { prisma } = require('../../shared/db');
const { dispatchJudgeJob } = require('../judge/judgeDispatch');
const { isLanguageSupported, SUPPORTED_LANGUAGES } = require('../judge/executor/languageConfig');
const { progressMapFor, toProgressDto } = require('../library/libraryHelpers');
const { buildSubmissionDto } = require('../submission/submissionDto');

const SOURCE_PLATFORMS = ['LEETCODE', 'GEEKSFORGEEKS', 'HACKERRANK', 'CODEFORCES', 'CODECHEF', 'ATCODER', 'INTERVIEWBIT', 'CUSTOM'];
// Mirror the Prisma enums. Browse filters are validated against these before they reach the
// database — an unrecognised value is a 400, not a Prisma exception surfacing as a 500.
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];
const FREQUENCY_BANDS = ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'];

/**
 * Upper bound on a single submission's source. Express already caps the JSON body at 1 MB,
 * so this mainly turns an oversized payload into a clear 413 instead of a parser error, and
 * keeps a pathological blob out of the database and the judge workdir.
 */
const MAX_CODE_LENGTH = 200_000;

// Return `value` upper-cased if it is one of `allowed`, otherwise null (so callers can default).
function normalizeEnum(value, allowed) {
  if (!value) return null;
  const v = String(value).toUpperCase();
  return allowed.includes(v) ? v : null;
}

// Turn an array of company names into CompanyTagMap `create` rows, upserting the tags as needed.
async function resolveCompanyTags(names) {
  if (!Array.isArray(names) || names.length === 0) return [];
  const creates = [];
  for (const raw of names) {
    const name = String(raw || '').trim();
    if (!name) continue;
    const tag = await prisma.companyTag.upsert({ where: { name }, update: {}, create: { name } });
    creates.push({ companyTagId: tag.id });
  }
  return creates;
}

// Map a `sort` query param to a Prisma orderBy, keeping nullable metadata columns sorted last.
function resolveSort(sort) {
  switch (String(sort || '')) {
    case 'frequency':
      return [{ frequencyBand: { sort: 'desc', nulls: 'last' } }, { frequencyScore: { sort: 'desc', nulls: 'last' } }];
    case 'acceptance':
      return [{ acceptanceRate: { sort: 'desc', nulls: 'last' } }];
    case 'estimatedTime':
      return [{ estimatedTimeMin: { sort: 'asc', nulls: 'last' } }];
    case 'title':
      return [{ title: 'asc' }];
    case 'difficulty':
      return [{ difficulty: 'asc' }];
    default:
      return [{ createdAt: 'desc' }];
  }
}

// Build the subset of `where` clauses that depend on the signed-in user's progress
// (solved/unsolved/attempted/bookmarked/revision-due). No-op for anonymous callers.
async function personalFilters(userId, query) {
  if (!userId) return {};
  const { status, bookmarked, revisionDue } = query;
  const clause = {};

  if (status || bookmarked === 'true') {
    const rows = await prisma.userQuestionProgress.findMany({ where: { userId }, select: { questionId: true, status: true, isBookmarked: true } });
    const solved = rows.filter((r) => r.status === 'SOLVED').map((r) => r.questionId);
    const attempted = rows.filter((r) => r.status === 'ATTEMPTED').map((r) => r.questionId);
    const bookmarkedIds = rows.filter((r) => r.isBookmarked).map((r) => r.questionId);

    const s = String(status || '').toLowerCase();
    if (s === 'solved') clause.id = { in: solved };
    else if (s === 'unsolved') clause.id = { notIn: solved };
    else if (s === 'attempted') clause.id = { in: attempted };

    if (bookmarked === 'true') {
      clause.id = clause.id ? { in: intersect(clause.id, bookmarkedIds) } : { in: bookmarkedIds };
    }
  }

  if (revisionDue === 'true') {
    const due = await prisma.revisionSchedule.findMany({
      where: { userId, nextReviewAt: { lte: new Date() } },
      select: { questionId: true }
    });
    const dueIds = due.map((r) => r.questionId);
    clause.id = clause.id?.in ? { in: intersect(clause.id, dueIds) } : { in: dueIds };
  }

  return clause;
}

// Intersect an existing `{ in: [...] }` / `{ notIn: [...] }` id clause with another id list.
function intersect(existing, ids) {
  if (existing?.in) return existing.in.filter((id) => ids.includes(id));
  if (existing?.notIn) return ids.filter((id) => !existing.notIn.includes(id));
  return ids;
}

async function getQuestions(req, res) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;
    const userId = req.user?.id || null;

    const { search, difficulty, topicId, topicSlug, tagId, companySlug, source, subtopic, frequency } = req.query;
    const where = {};

    if (search) {
      where.OR = [
        { title: { contains: String(search), mode: 'insensitive' } },
        { description: { contains: String(search), mode: 'insensitive' } }
      ];
    }
    // Enum-backed filters must be validated before they reach Prisma. An unknown value is a
    // client mistake (or a probe), and passing it through makes Prisma throw — which surfaced
    // as a 500 on any bad ?difficulty=/?source=/?frequency= value.
    const enumFilter = normalizeEnum;
    if (difficulty) {
      const v = enumFilter(difficulty, DIFFICULTIES);
      if (!v) return res.status(400).json({ success: false, error: `Unknown difficulty "${difficulty}". Expected one of: ${DIFFICULTIES.join(', ')}`, code: 'INVALID_FILTER' });
      where.difficulty = v;
    }
    if (source) {
      const v = enumFilter(source, SOURCE_PLATFORMS);
      if (!v) return res.status(400).json({ success: false, error: `Unknown source "${source}". Expected one of: ${SOURCE_PLATFORMS.join(', ')}`, code: 'INVALID_FILTER' });
      where.sourcePlatform = v;
    }
    if (frequency) {
      const v = enumFilter(frequency, FREQUENCY_BANDS);
      if (!v) return res.status(400).json({ success: false, error: `Unknown frequency "${frequency}". Expected one of: ${FREQUENCY_BANDS.join(', ')}`, code: 'INVALID_FILTER' });
      where.frequencyBand = v;
    }
    // Most of the library is external references (metadata + a link, no local statement and no
    // test cases), so browsing mixes problems you can solve here with ones you cannot. This
    // lets the client ask for one or the other instead of making the user find out by clicking.
    if (req.query.solvable === 'true') where.isExternalOnly = false;
    else if (req.query.solvable === 'false') where.isExternalOnly = true;

    if (topicId) where.topicId = String(topicId);
    if (topicSlug) where.topic = { slug: String(topicSlug) };
    if (tagId) where.questionTags = { some: { tagId: String(tagId) } };
    if (subtopic) where.subtopics = { has: String(subtopic) };
    if (companySlug) {
      where.companyTags = { some: { companyTag: { name: { equals: companyName(String(companySlug)), mode: 'insensitive' } } } };
    }

    // Personal (progress-derived) filters may narrow the id set.
    const personal = await personalFilters(userId, req.query);
    if (personal.id) where.id = personal.id;

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
        orderBy: resolveSort(req.query.sort)
      })
    ]);

    // Merge the caller's per-question progress so the client can render status/bookmark badges.
    const pmap = await progressMapFor(prisma, userId, questions.map((q) => q.id));
    const data = questions.map((q) => ({
      ...q,
      companies: (q.companyTags || []).map((c) => c.companyTag?.name).filter(Boolean),
      progress: toProgressDto(pmap.get(q.id))
    }));

    res.json({
      success: true,
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// Company filters come in as slugs; recover an approximate display name for a case-insensitive match.
function companyName(slug) {
  return slug.replace(/-/g, ' ');
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

    // Security: never expose hidden (non-sample) test cases to solvers. Only admins
    // (who author/maintain questions) may see the full hidden test suite.
    if (req.user?.role !== 'ADMIN') {
      question.testCases = (question.testCases || []).filter((tc) => tc.isSample);
    }

    // Attach the caller's personal library state (progress, private note, revision schedule).
    let personal = null;
    if (req.user?.id) {
      const [progressRow, note, revision] = await Promise.all([
        prisma.userQuestionProgress.findUnique({ where: { userId_questionId: { userId: req.user.id, questionId: question.id } } }),
        prisma.userQuestionNote.findUnique({ where: { userId_questionId: { userId: req.user.id, questionId: question.id } } }),
        prisma.revisionSchedule.findUnique({ where: { userId_questionId: { userId: req.user.id, questionId: question.id } } })
      ]);
      personal = {
        progress: toProgressDto(progressRow),
        note: note || null,
        revision: revision || null
      };
    }

    res.json({
      success: true,
      data: {
        ...question,
        companies: (question.companyTags || []).map((c) => c.companyTag?.name).filter(Boolean),
        personal
      }
    });
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
      editorialSolution,
      // --- Library metadata ---
      subtopics,
      frequencyBand,
      frequencyScore,
      estimatedTimeMin,
      sourcePlatform,
      sourceUrl,
      originalAuthor,
      authorNotes,
      contentStatus,
      acceptanceRate,
      isExternalOnly,
      companyTags
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

    // Resolve company tag names to ids (create tags on first use).
    const companyTagCreates = await resolveCompanyTags(companyTags);
    const external = isExternalOnly === true;

    const question = await prisma.question.create({
      data: {
        title,
        slug: `${slug}-${Date.now().toString().slice(-4)}`,
        difficulty: difficulty || 'EASY',
        topicId: topic.id,
        description: description || (external ? 'External problem — see the source link. No statement stored.' : 'Problem description.'),
        constraints: constraints || (external ? 'See source' : '1 <= N <= 10^5'),
        timeLimitMs: Number(timeLimitMs) || 2000,
        memoryLimitMb: Number(memoryLimitMb) || 256,

        // Library metadata
        subtopics: Array.isArray(subtopics) ? subtopics.filter(Boolean).map(String) : [],
        frequencyBand: normalizeEnum(frequencyBand, ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']),
        frequencyScore: frequencyScore != null ? Number(frequencyScore) : null,
        estimatedTimeMin: estimatedTimeMin != null ? Number(estimatedTimeMin) : null,
        sourcePlatform: normalizeEnum(sourcePlatform, SOURCE_PLATFORMS) || 'CUSTOM',
        sourceUrl: sourceUrl || null,
        originalAuthor: originalAuthor || null,
        authorNotes: authorNotes || null,
        contentStatus: normalizeEnum(contentStatus, ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED']) || 'PUBLISHED',
        acceptanceRate: acceptanceRate != null ? Number(acceptanceRate) : null,
        isExternalOnly: external,
        ...(companyTagCreates.length ? { companyTags: { create: companyTagCreates } } : {}),

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
        editorial: true,
        companyTags: { include: { companyTag: true } }
      }
    });

    res.status(201).json({ success: true, data: question });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function updateQuestion(req, res) {
  try {
    const b = req.body;
    const data = {
      ...(b.title && { title: b.title }),
      ...(b.difficulty && { difficulty: b.difficulty }),
      ...(b.description !== undefined && { description: b.description }),
      ...(b.constraints !== undefined && { constraints: b.constraints }),
      // Library metadata (all optional)
      ...(Array.isArray(b.subtopics) && { subtopics: b.subtopics.filter(Boolean).map(String) }),
      ...(b.frequencyBand !== undefined && { frequencyBand: normalizeEnum(b.frequencyBand, ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']) }),
      ...(b.frequencyScore !== undefined && { frequencyScore: b.frequencyScore != null ? Number(b.frequencyScore) : null }),
      ...(b.estimatedTimeMin !== undefined && { estimatedTimeMin: b.estimatedTimeMin != null ? Number(b.estimatedTimeMin) : null }),
      ...(b.sourcePlatform !== undefined && { sourcePlatform: normalizeEnum(b.sourcePlatform, SOURCE_PLATFORMS) || 'CUSTOM' }),
      ...(b.sourceUrl !== undefined && { sourceUrl: b.sourceUrl || null }),
      ...(b.originalAuthor !== undefined && { originalAuthor: b.originalAuthor || null }),
      ...(b.authorNotes !== undefined && { authorNotes: b.authorNotes || null }),
      ...(b.contentStatus !== undefined && { contentStatus: normalizeEnum(b.contentStatus, ['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'ARCHIVED']) || 'PUBLISHED' }),
      ...(b.acceptanceRate !== undefined && { acceptanceRate: b.acceptanceRate != null ? Number(b.acceptanceRate) : null }),
      ...(b.isExternalOnly !== undefined && { isExternalOnly: !!b.isExternalOnly })
    };

    // Company tags: when provided, replace the full set.
    if (Array.isArray(b.companyTags)) {
      const creates = await resolveCompanyTags(b.companyTags);
      await prisma.companyTagMap.deleteMany({ where: { questionId: req.params.id } });
      data.companyTags = { create: creates };
    }

    const question = await prisma.question.update({
      where: { id: req.params.id },
      data,
      include: { topic: true, starterCodes: true, testCases: true, companyTags: { include: { companyTag: true } } }
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
    // `context`/`contestId` are deliberately NOT read from the body. They used to be, which
    // let a client post `context: 'CONTEST', contestId: <any id>` here and bypass every rule
    // the contest endpoint enforces — the contest window, participation, and whether the
    // question is even in that contest. Confirmed exploitable: it awarded points in a contest
    // that had already ended, and in a contest that never contained the question.
    // This endpoint is now unconditionally PRACTICE; contest submissions go through
    // POST /contests/:id/submit, which owns those checks.
    const { code, language, mode } = req.body;
    const questionId = req.params.id;
    const normalizedLanguage = (language || 'PYTHON').toUpperCase();

    // "Run" tries the visible samples; "Submit" is the real attempt against every test.
    // Defaults to submit so existing callers keep their behaviour.
    const isTrialRun = String(mode || '').toLowerCase() === 'run';

    // `code` is written straight into a String column. Anything that is not a string (null,
    // an array, an object) used to reach Prisma and throw, surfacing as a 500 with a raw
    // driver message. Reject it here as the client error it is.
    if (typeof code !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Field "code" must be a string.',
        code: 'INVALID_CODE',
      });
    }
    if (code.length > MAX_CODE_LENGTH) {
      return res.status(413).json({
        success: false,
        error: `Submission is too large (${code.length} characters). The limit is ${MAX_CODE_LENGTH}.`,
        code: 'CODE_TOO_LARGE',
      });
    }

    const question = await prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      return res.status(404).json({ success: false, error: 'Question not found' });
    }

    // Only accept languages the judge can actually execute, so the verdict is honest.
    if (!isLanguageSupported(normalizedLanguage)) {
      return res.status(400).json({
        success: false,
        error: `Language "${normalizedLanguage}" is not supported. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`
      });
    }

    const submission = await prisma.submission.create({
      data: {
        userId: req.user.id,
        questionId: question.id,
        context: 'PRACTICE',
        code,
        language: normalizedLanguage,
        status: 'PENDING',
        isTrialRun
      }
    });

    const jobId = await dispatchJudgeJob({
      submissionId: submission.id,
      questionId: question.id,
      code,
      language: normalizedLanguage,
      timeLimitMs: question.timeLimitMs,
      memoryLimitMb: question.memoryLimitMb
    });

    res.json({
      success: true,
      data: {
        submissionId: submission.id,
        jobId,
        status: 'QUEUED',
        mode: isTrialRun ? 'run' : 'submit'
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
      include: { executions: { orderBy: { judgedAt: 'desc' }, take: 1 } }
    });

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    // Security (IDOR): a user may only read their own submissions; admins may read any.
    const isAdmin = req.user.role === 'ADMIN';
    if (submission.userId !== req.user.id && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Not authorized to view this submission' });
    }

    // Must go through the DTO. Returning the raw row shipped `executions[].testResults`,
    // which carries the expected output of every HIDDEN test case — handing the solver the
    // graded answers for the tests they are explicitly not allowed to see.
    res.json({ success: true, data: buildSubmissionDto(submission, { isAdmin }) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getUserSubmissionsForQuestion(req, res) {
  try {
    const questionId = req.params.id;
    const isAdmin = req.user.role === 'ADMIN';
    const submissions = await prisma.submission.findMany({
      where: {
        questionId,
        userId: req.user.id,
        // "Run" results are scratch work — the History tab shows real submissions only.
        isTrialRun: false
      },
      include: { executions: { take: 1, orderBy: { judgedAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    // Same hidden-test-case protection as every other submission read path.
    res.json({ success: true, data: submissions.map((s) => buildSubmissionDto(s, { isAdmin })) });
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
