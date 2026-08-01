// Spaced-repetition (SM-2 flavoured) scheduling for the revision system.
//
// The RevisionSchedule model stores one row per (user, question). `computeSchedule` maps a
// 0–5 confidence rating onto the next interval + ease factor; `reviewQuestion` persists it.
// `enqueueForRevision` seeds a schedule automatically the first time a question is solved so
// the daily queue fills itself without the user having to opt in.

const START_INTERVALS = { 3: 3, 4: 6, 5: 14 }; // first successful review, by confidence

/**
 * SM-2 style update. `prev` is the existing RevisionSchedule row (or null for a new card).
 * `quality` is 0–5 (we surface 2=Hard, 3=Good, 4=Easy, 5=Perfect in the UI).
 * Returns the next { easeFactor, intervalDays, reviewCount } — caller derives nextReviewAt.
 */
function computeSchedule(prev, quality) {
  const q = Math.max(0, Math.min(5, Math.round(Number(quality) || 0)));
  const prevEase = prev?.easeFactor ?? 2.5;
  const prevInterval = prev?.intervalDays ?? 1;
  const prevCount = prev?.reviewCount ?? 0;

  // Standard SM-2 ease adjustment, floored at 1.3.
  const easeFactor = Math.max(1.3, prevEase + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  if (q < 3) {
    // Failed recall — restart the ladder but keep the (now lower) ease.
    return { easeFactor, intervalDays: 1, reviewCount: 0 };
  }

  let intervalDays;
  if (prevCount === 0) {
    intervalDays = START_INTERVALS[q] || 3;
  } else {
    intervalDays = Math.max(1, Math.round(prevInterval * easeFactor));
  }
  return { easeFactor, intervalDays, reviewCount: prevCount + 1 };
}

/** Grade a review and persist the next schedule. Returns the updated row. */
async function reviewQuestion(prisma, { userId, questionId, quality }) {
  const key = { userId_questionId: { userId, questionId } };
  const existing = await prisma.revisionSchedule.findUnique({ where: key });
  const next = computeSchedule(existing, quality);
  const now = new Date();
  const nextReviewAt = new Date(now.getTime() + next.intervalDays * 86400000);

  return prisma.revisionSchedule.upsert({
    where: key,
    update: { ...next, lastReviewedAt: now, nextReviewAt },
    create: { userId, questionId, ...next, lastReviewedAt: now, nextReviewAt }
  });
}

/**
 * Ensure a question is on the user's revision ladder. Called automatically on first solve.
 * No-op if a schedule already exists (never disturbs an in-progress ladder) or if the model
 * is absent (unit tests inject a fake prisma). Never throws into the judge path.
 */
async function enqueueForRevision(prisma, { userId, questionId, dueInDays = 1 }) {
  if (!prisma || !prisma.revisionSchedule || !userId || !questionId) return null;
  try {
    const key = { userId_questionId: { userId, questionId } };
    const existing = await prisma.revisionSchedule.findUnique({ where: key });
    if (existing) return existing;
    const now = new Date();
    return await prisma.revisionSchedule.create({
      data: {
        userId,
        questionId,
        intervalDays: Math.max(0, dueInDays),
        easeFactor: 2.5,
        reviewCount: 0,
        lastReviewedAt: now,
        nextReviewAt: new Date(now.getTime() + Math.max(0, dueInDays) * 86400000)
      }
    });
  } catch {
    return null; // scheduling is best-effort; never break the caller.
  }
}

module.exports = { computeSchedule, reviewQuestion, enqueueForRevision, START_INTERVALS };
