const { prisma } = require('../../shared/db');

// The seven private note fields the product brief calls for. Anything else in the body is ignored.
const NOTE_FIELDS = [
  'approach',
  'mistakes',
  'edgeCases',
  'timeComplexity',
  'spaceComplexity',
  'keyInsights',
  'revisionNotes'
];

function pickNoteFields(body) {
  const out = {};
  for (const f of NOTE_FIELDS) {
    if (body[f] !== undefined) out[f] = body[f] === null ? null : String(body[f]);
  }
  return out;
}

// GET /library/notes/:questionId — the caller's private notes for a question (never anyone else's).
async function getNote(req, res) {
  try {
    const note = await prisma.userQuestionNote.findUnique({
      where: { userId_questionId: { userId: req.user.id, questionId: req.params.questionId } }
    });
    // Return an empty shell rather than 404 so the client can render an editable form.
    res.json({ success: true, data: note || { questionId: req.params.questionId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// PUT /library/notes/:questionId — upsert the caller's private notes.
async function upsertNote(req, res) {
  try {
    const userId = req.user.id;
    const questionId = req.params.questionId;
    const fields = pickNoteFields(req.body || {});

    const note = await prisma.userQuestionNote.upsert({
      where: { userId_questionId: { userId, questionId } },
      update: fields,
      create: { userId, questionId, ...fields }
    });

    res.json({ success: true, data: note });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { getNote, upsertNote };
