const express = require('express');
const { requireAuthenticated, attachUser } = require('../auth/authMiddleware');

const sheets = require('./sheetController');
const progress = require('./progressController');
const notes = require('./notesController');
const practice = require('./practiceController');
const collections = require('./collectionController');

const router = express.Router();

// ---- Study sheets ----
// Listing/reading personalise for a signed-in user but stay open to anonymous visitors.
router.get('/sheets', attachUser, sheets.listSheets);
router.get('/sheets/:slug', attachUser, sheets.getSheet);
router.post('/sheets', requireAuthenticated, sheets.createSheet);
router.put('/sheets/:id', requireAuthenticated, sheets.updateSheet);
router.delete('/sheets/:id', requireAuthenticated, sheets.deleteSheet);
router.post('/sheets/:id/items', requireAuthenticated, sheets.addSheetItem);
router.delete('/sheets/:id/items/:questionId', requireAuthenticated, sheets.removeSheetItem);
router.put('/sheets/:id/reorder', requireAuthenticated, sheets.reorderSheet);

// ---- Progress (always personal) ----
router.get('/progress', requireAuthenticated, progress.listProgress);
router.get('/progress/stats', requireAuthenticated, progress.getStats);
router.patch('/progress/:questionId', requireAuthenticated, progress.setStatus);
router.post('/progress/:questionId/bookmark', requireAuthenticated, progress.toggleBookmark);

// ---- Private notes ----
router.get('/notes/:questionId', requireAuthenticated, notes.getNote);
router.put('/notes/:questionId', requireAuthenticated, notes.upsertNote);

// ---- Practice modes ----
router.get('/practice/random', attachUser, practice.random);
router.get('/practice/daily', attachUser, practice.daily);
router.get('/practice/topic/:slug', attachUser, practice.byTopic);
router.get('/practice/company/:slug', attachUser, practice.byCompany);
router.get('/practice/revision-queue', requireAuthenticated, practice.revisionQueue);
router.get('/practice/weak-topics', requireAuthenticated, practice.weakTopics);
router.get('/practice/mixed', attachUser, practice.mixed);
router.post('/practice/mock', attachUser, practice.mock);

// ---- Collections ----
router.get('/collections/companies', attachUser, collections.companies);
router.get('/collections/topics', attachUser, collections.topics);
router.get('/collections/sources', attachUser, collections.sources);

module.exports = router;
