const { prisma } = require('../../shared/db');
const {
  slugify,
  QUESTION_CARD_SELECT,
  flattenCompanies,
  progressMapFor,
  toProgressDto
} = require('./libraryHelpers');

// Is this sheet writable by the requester? System sheets → admins only; custom → owner or admin.
function canEditSheet(sheet, user) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true;
  if (sheet.kind === 'SYSTEM') return false;
  return sheet.ownerId === user.id;
}

// GET /library/sheets — system sheets + the caller's own custom sheets, with progress summary.
async function listSheets(req, res) {
  try {
    const userId = req.user?.id || null;
    const where = userId
      ? { OR: [{ kind: 'SYSTEM' }, { ownerId: userId }] }
      : { kind: 'SYSTEM', isPublic: true };

    const sheets = await prisma.studySheet.findMany({
      where,
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      include: { items: { select: { questionId: true } } }
    });

    // Count how many questions in each sheet the user has solved (single query, then bucket).
    let solvedByQuestion = new Set();
    if (userId) {
      const allQ = [...new Set(sheets.flatMap((s) => s.items.map((i) => i.questionId)))];
      const solved = await prisma.userQuestionProgress.findMany({
        where: { userId, questionId: { in: allQ }, status: 'SOLVED' },
        select: { questionId: true }
      });
      solvedByQuestion = new Set(solved.map((r) => r.questionId));
    }

    const data = sheets.map((s) => {
      const total = s.items.length;
      const solvedCount = s.items.filter((i) => solvedByQuestion.has(i.questionId)).length;
      return {
        id: s.id,
        name: s.name,
        slug: s.slug,
        description: s.description,
        kind: s.kind,
        ownerId: s.ownerId,
        isPublic: s.isPublic,
        total,
        solvedCount,
        canEdit: canEditSheet(s, req.user)
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /library/sheets/:slug — full sheet with ordered, section-grouped items + user progress.
async function getSheet(req, res) {
  try {
    const userId = req.user?.id || null;
    const sheet = await prisma.studySheet.findUnique({
      where: { slug: req.params.slug },
      include: {
        items: {
          orderBy: [{ section: 'asc' }, { orderIndex: 'asc' }],
          include: { question: { select: QUESTION_CARD_SELECT } }
        }
      }
    });

    if (!sheet) return res.status(404).json({ success: false, error: 'Sheet not found' });
    // Private custom sheets are visible only to their owner (or an admin).
    if (sheet.kind === 'CUSTOM' && !sheet.isPublic && sheet.ownerId !== userId && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'This sheet is private' });
    }

    const questionIds = sheet.items.map((i) => i.questionId);
    const progress = await progressMapFor(prisma, userId, questionIds);

    const items = sheet.items.map((i) => ({
      questionId: i.questionId,
      section: i.section,
      orderIndex: i.orderIndex,
      question: flattenCompanies(i.question),
      progress: toProgressDto(progress.get(i.questionId))
    }));

    const solvedCount = items.filter((i) => i.progress.status === 'SOLVED').length;

    res.json({
      success: true,
      data: {
        id: sheet.id,
        name: sheet.name,
        slug: sheet.slug,
        description: sheet.description,
        kind: sheet.kind,
        ownerId: sheet.ownerId,
        isPublic: sheet.isPublic,
        canEdit: canEditSheet(sheet, req.user),
        total: items.length,
        solvedCount,
        items
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /library/sheets — create a custom sheet owned by the caller.
async function createSheet(req, res) {
  try {
    const { name, description, isPublic, questionIds } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'Sheet name is required' });
    }

    const slug = `${slugify(name)}-${Date.now().toString(36).slice(-4)}`;
    const items = Array.isArray(questionIds)
      ? questionIds.map((qid, idx) => ({ questionId: qid, orderIndex: idx }))
      : [];

    const sheet = await prisma.studySheet.create({
      data: {
        name: String(name).trim(),
        slug,
        description: description || null,
        kind: 'CUSTOM',
        ownerId: req.user.id,
        isPublic: isPublic !== false,
        items: items.length ? { create: items } : undefined
      }
    });

    res.status(201).json({ success: true, data: sheet });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

async function loadEditableSheet(req, res) {
  const sheet = await prisma.studySheet.findUnique({ where: { id: req.params.id } });
  if (!sheet) {
    res.status(404).json({ success: false, error: 'Sheet not found' });
    return null;
  }
  if (!canEditSheet(sheet, req.user)) {
    res.status(403).json({ success: false, error: 'Not authorized to edit this sheet' });
    return null;
  }
  return sheet;
}

// PUT /library/sheets/:id — rename / re-describe / toggle visibility.
async function updateSheet(req, res) {
  try {
    const sheet = await loadEditableSheet(req, res);
    if (!sheet) return;
    const { name, description, isPublic } = req.body;
    const updated = await prisma.studySheet.update({
      where: { id: sheet.id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(description !== undefined && { description }),
        ...(isPublic !== undefined && { isPublic: !!isPublic })
      }
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /library/sheets/:id
async function deleteSheet(req, res) {
  try {
    const sheet = await loadEditableSheet(req, res);
    if (!sheet) return;
    await prisma.studySheet.delete({ where: { id: sheet.id } });
    res.json({ success: true, message: 'Sheet deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /library/sheets/:id/items — append a question (idempotent on the unique pair).
async function addSheetItem(req, res) {
  try {
    const sheet = await loadEditableSheet(req, res);
    if (!sheet) return;
    const { questionId, section } = req.body;
    if (!questionId) return res.status(400).json({ success: false, error: 'questionId is required' });

    const question = await prisma.question.findUnique({ where: { id: questionId }, select: { id: true } });
    if (!question) return res.status(404).json({ success: false, error: 'Question not found' });

    const last = await prisma.sheetItem.findFirst({
      where: { sheetId: sheet.id },
      orderBy: { orderIndex: 'desc' }
    });

    const item = await prisma.sheetItem.upsert({
      where: { sheetId_questionId: { sheetId: sheet.id, questionId } },
      update: { ...(section !== undefined && { section }) },
      create: {
        sheetId: sheet.id,
        questionId,
        section: section || null,
        orderIndex: (last?.orderIndex ?? -1) + 1
      }
    });

    res.status(201).json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /library/sheets/:id/items/:questionId
async function removeSheetItem(req, res) {
  try {
    const sheet = await loadEditableSheet(req, res);
    if (!sheet) return;
    await prisma.sheetItem.deleteMany({
      where: { sheetId: sheet.id, questionId: req.params.questionId }
    });
    res.json({ success: true, message: 'Item removed' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// PUT /library/sheets/:id/reorder — { order: [questionId, ...] } sets explicit ordering.
async function reorderSheet(req, res) {
  try {
    const sheet = await loadEditableSheet(req, res);
    if (!sheet) return;
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ success: false, error: 'order must be an array of questionIds' });
    }
    await prisma.$transaction(
      order.map((questionId, idx) =>
        prisma.sheetItem.updateMany({
          where: { sheetId: sheet.id, questionId },
          data: { orderIndex: idx }
        })
      )
    );
    res.json({ success: true, message: 'Sheet reordered' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  listSheets,
  getSheet,
  createSheet,
  updateSheet,
  deleteSheet,
  addSheetItem,
  removeSheetItem,
  reorderSheet
};
