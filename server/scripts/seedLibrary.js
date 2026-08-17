// Idempotent seed for the Question Library: topics, company tags, external problem references
// (metadata + links only), and the curated system study sheets. Safe to re-run.
//
//   node scripts/seedLibrary.js      (or: npm run seed)

require('dotenv').config();
const { prisma } = require('../src/shared/db');
const { PROBLEMS, SECTIONS, COMPANIES } = require('../prisma/data/problems');
const { SHEETS } = require('../prisma/data/sheets');
const { SOLVABLE, starters } = require('../prisma/data/solvable');
const { verify } = require('./verifySolvable');

const slugify = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// The canonical topic list from the product brief (plus any referenced by problems).
const TOPICS = [
  'Arrays', 'Strings', 'Hashing', 'Two Pointers', 'Sliding Window', 'Binary Search', 'Sorting',
  'Stack', 'Queue', 'Linked List', 'Trees', 'BST', 'Heap', 'Graphs', 'DFS', 'BFS',
  'Dynamic Programming', 'Greedy', 'Backtracking', 'Tries', 'Segment Tree', 'Union Find',
  'Bit Manipulation', 'Math'
];

const EXTERNAL_DESC = 'External problem reference — open the source link for the full statement. NextHire stores only metadata (title, topic, difficulty, tags) and a link; no problem statement or test cases are copied.';

async function seedTopics() {
  const names = new Set([...TOPICS, ...PROBLEMS.map((p) => p.topic)]);
  for (const name of names) {
    await prisma.topic.upsert({
      where: { name },
      update: { slug: slugify(name) },
      create: { name, slug: slugify(name) }
    });
  }
  return prisma.topic.findMany();
}

async function seedCompanies() {
  const names = new Set([...COMPANIES, ...PROBLEMS.flatMap((p) => p.companyTags)].filter(Boolean));
  for (const name of names) {
    await prisma.companyTag.upsert({ where: { name }, update: {}, create: { name } });
  }
  return prisma.companyTag.findMany();
}

async function seedProblems(topicByName, companyByName) {
  const slugToId = new Map();
  for (const p of PROBLEMS) {
    const topicId = topicByName.get(p.topic)?.id;
    if (!topicId) {
      console.warn(`  ! skipping ${p.slug}: unknown topic "${p.topic}"`);
      continue;
    }

    const data = {
      title: p.title,
      difficulty: p.difficulty,
      topicId,
      subtopics: p.subtopics || [],
      frequencyBand: p.frequencyBand || null,
      estimatedTimeMin: p.estimatedTimeMin || null,
      sourcePlatform: p.sourcePlatform || 'LEETCODE',
      sourceUrl: p.sourceUrl || null,
      contentStatus: 'PUBLISHED',
      isExternalOnly: true
    };

    const question = await prisma.question.upsert({
      where: { slug: p.slug },
      update: data,
      create: { ...data, slug: p.slug, description: EXTERNAL_DESC, constraints: 'See source' }
    });
    slugToId.set(p.slug, question.id);

    // Refresh company tag maps for this question.
    await prisma.companyTagMap.deleteMany({ where: { questionId: question.id } });
    const maps = (p.companyTags || [])
      .map((name) => companyByName.get(name)?.id)
      .filter(Boolean)
      .map((companyTagId) => ({ questionId: question.id, companyTagId }));
    if (maps.length) await prisma.companyTagMap.createMany({ data: maps, skipDuplicates: true });
  }
  return slugToId;
}

/**
 * Seed the problems the judge can actually run: full statement, sample + hidden test cases,
 * starter code per language, hints and an editorial.
 *
 * Idempotent by slug. Test cases, starter code and hints are rebuilt from the definition on
 * every run so an edit to prisma/data/solvable.js is the single source of truth — otherwise a
 * corrected expected output would leave the stale one behind and keep failing correct answers.
 */
async function seedSolvable(topicByName) {
  for (const p of SOLVABLE) {
    const topicId = topicByName.get(p.topic)?.id;
    if (!topicId) {
      console.warn(`  ! skipping ${p.slug}: unknown topic "${p.topic}"`);
      continue;
    }

    const data = {
      title: p.title,
      difficulty: p.difficulty,
      topicId,
      description: p.description,
      constraints: p.constraints,
      timeLimitMs: p.timeLimitMs || 2000,
      memoryLimitMb: p.memoryLimitMb || 256,
      subtopics: p.subtopics || [],
      estimatedTimeMin: p.estimatedTimeMin || null,
      sourcePlatform: 'CUSTOM',
      contentStatus: 'PUBLISHED',
      // The whole point: these have a local statement and local tests, so the judge runs them.
      isExternalOnly: false,
    };

    const question = await prisma.question.upsert({
      where: { slug: p.slug },
      update: data,
      create: { ...data, slug: p.slug },
    });

    // Rebuild the child records so edits to the definition actually take effect.
    await prisma.testCase.deleteMany({ where: { questionId: question.id } });
    await prisma.testCase.createMany({
      data: p.tests.map((t, i) => ({
        questionId: question.id,
        input: t.input,
        expectedOutput: t.expectedOutput,
        explanation: t.explanation || null,
        isSample: Boolean(t.isSample),
        orderIndex: i,
      })),
    });

    await prisma.starterCode.deleteMany({ where: { questionId: question.id } });
    await prisma.starterCode.createMany({
      data: starters(p.starters).map((sc) => ({ questionId: question.id, ...sc })),
    });

    await prisma.hint.deleteMany({ where: { questionId: question.id } });
    if (p.hints?.length) {
      await prisma.hint.createMany({
        data: p.hints.map((content, orderIndex) => ({ questionId: question.id, content, orderIndex })),
      });
    }

    if (p.editorial) {
      await prisma.editorial.upsert({
        where: { questionId: question.id },
        update: { content: p.editorial.content, solution: p.editorial.solution },
        create: { questionId: question.id, content: p.editorial.content, solution: p.editorial.solution },
      });
    }
  }
  return SOLVABLE.length;
}

// Resolve a sheet's membership into ordered items: [{ slug, section, orderIndex }].
function resolveMembership(sheet) {
  if (sheet.membership === 'all') {
    const items = [];
    let order = 0;
    for (const group of SECTIONS) {
      for (const [, slug] of group.rows) items.push({ slug, section: group.section, orderIndex: order++ });
    }
    return items;
  }
  if (sheet.membership === 'blind75') {
    const items = [];
    let order = 0;
    for (const p of PROBLEMS) {
      if (p.isBlind75) items.push({ slug: p.slug, section: p.section, orderIndex: order++ });
    }
    return items;
  }
  // Explicit ordered slug list; section defaults to the problem's topic.
  const bySlug = new Map(PROBLEMS.map((p) => [p.slug, p]));
  return sheet.membership.map((slug, i) => ({
    slug,
    section: bySlug.get(slug)?.topic || 'General',
    orderIndex: i
  }));
}

async function seedSheets(slugToId) {
  for (const def of SHEETS) {
    const sheet = await prisma.studySheet.upsert({
      where: { slug: def.slug },
      update: { name: def.name, description: def.description, kind: 'SYSTEM', ownerId: null, isPublic: true },
      create: { name: def.name, slug: def.slug, description: def.description, kind: 'SYSTEM', ownerId: null, isPublic: true }
    });

    const items = resolveMembership(def)
      .map((it) => ({ ...it, questionId: slugToId.get(it.slug) }))
      .filter((it) => it.questionId);
    const missing = resolveMembership(def).length - items.length;

    // Rebuild the sheet's items to match the current definition exactly.
    await prisma.sheetItem.deleteMany({ where: { sheetId: sheet.id } });
    if (items.length) {
      await prisma.sheetItem.createMany({
        data: items.map((it) => ({ sheetId: sheet.id, questionId: it.questionId, section: it.section, orderIndex: it.orderIndex })),
        skipDuplicates: true
      });
    }
    console.log(`  • ${def.name}: ${items.length} items${missing ? ` (${missing} unresolved slugs skipped)` : ''}`);
  }
}

async function main() {
  // Refuse to seed a problem whose own reference solution disagrees with its expected output.
  // A wrong expected output is the worst bug a judge can ship: the user writes a correct
  // solution, gets WRONG_ANSWER, and has no way to tell that from a bug in their own code.
  console.log('Verifying solvable problem set…');
  if (!(await verify())) {
    throw new Error('solvable problem set failed verification — nothing was written');
  }

  console.log('\nSeeding Question Library…');
  const topics = await seedTopics();
  const companies = await seedCompanies();
  const topicByName = new Map(topics.map((t) => [t.name, t]));
  const companyByName = new Map(companies.map((c) => [c.name, c]));
  console.log(`  topics: ${topics.length}, companies: ${companies.length}`);

  const solvableCount = await seedSolvable(topicByName);
  console.log(`  solvable problems (local statement + judge test cases): ${solvableCount}`);

  const slugToId = await seedProblems(topicByName, companyByName);
  console.log(`  external references (metadata + link only): ${slugToId.size}`);

  await seedSheets(slugToId);
  console.log('Done.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
