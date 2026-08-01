// Shared helpers for the Question Library feature module.

/** Turn an arbitrary label into a URL-safe slug. */
function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}

// Lean projection of a Question for library/browse/sheet payloads — enough to render a row
// and its metadata badges without shipping the full statement, test cases, or starter code.
const QUESTION_CARD_SELECT = {
  id: true,
  title: true,
  slug: true,
  difficulty: true,
  subtopics: true,
  frequencyBand: true,
  frequencyScore: true,
  estimatedTimeMin: true,
  sourcePlatform: true,
  sourceUrl: true,
  originalAuthor: true,
  contentStatus: true,
  acceptanceRate: true,
  isExternalOnly: true,
  createdAt: true,
  topic: { select: { id: true, name: true, slug: true } },
  companyTags: { select: { companyTag: { select: { id: true, name: true } } } }
};

/** Flatten the nested companyTags relation into a simple string[] of company names. */
function flattenCompanies(question) {
  if (!question) return question;
  const companies = Array.isArray(question.companyTags)
    ? question.companyTags.map((c) => c.companyTag?.name).filter(Boolean)
    : [];
  return { ...question, companies, companyTags: undefined };
}

/**
 * Fetch the current user's progress for a set of question ids and return a Map keyed by
 * questionId. Returns an empty Map for anonymous users.
 */
async function progressMapFor(prisma, userId, questionIds) {
  if (!userId || !questionIds || questionIds.length === 0) return new Map();
  const rows = await prisma.userQuestionProgress.findMany({
    where: { userId, questionId: { in: questionIds } }
  });
  return new Map(rows.map((r) => [r.questionId, r]));
}

/** Shape a raw progress row into the compact object the client consumes. */
function toProgressDto(row) {
  if (!row) return { status: 'TODO', attempts: 0, acceptedCount: 0, isBookmarked: false, avgSolveSec: null };
  return {
    status: row.status,
    attempts: row.attempts,
    acceptedCount: row.acceptedCount,
    isBookmarked: row.isBookmarked,
    firstSolvedAt: row.firstSolvedAt,
    lastPracticedAt: row.lastPracticedAt,
    avgSolveSec: row.solveSessions > 0 ? Math.round(row.totalSolveSec / row.solveSessions) : null
  };
}

module.exports = {
  slugify,
  QUESTION_CARD_SELECT,
  flattenCompanies,
  progressMapFor,
  toProgressDto
};
