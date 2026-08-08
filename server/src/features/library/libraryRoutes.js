const express = require('express');
const { requireAuthenticated, requirePermission, attachUser } = require('../auth/authMiddleware');

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
// Sheet ownership is enforced per-record in the controller; the permission gate here only
// establishes that the caller may author sheets at all.
const manageOwnSheets = [requireAuthenticated, requirePermission('sheet:manage-own')];
router.post('/sheets', ...manageOwnSheets, sheets.createSheet);
router.put('/sheets/:id', ...manageOwnSheets, sheets.updateSheet);
router.delete('/sheets/:id', ...manageOwnSheets, sheets.deleteSheet);
router.post('/sheets/:id/items', ...manageOwnSheets, sheets.addSheetItem);
router.delete('/sheets/:id/items/:questionId', ...manageOwnSheets, sheets.removeSheetItem);
router.put('/sheets/:id/reorder', ...manageOwnSheets, sheets.reorderSheet);

// ---- Progress (always personal) ----
router.get('/progress', requireAuthenticated, requirePermission('progress:read'), progress.listProgress);
router.get('/progress/stats', requireAuthenticated, requirePermission('progress:read'), progress.getStats);
router.get('/progress/activity', requireAuthenticated, requirePermission('progress:read'), progress.getActivity);
router.patch('/progress/:questionId', requireAuthenticated, requirePermission('practice:use'), progress.setStatus);
router.post('/progress/:questionId/bookmark', requireAuthenticated, requirePermission('practice:use'), progress.toggleBookmark);

// ---- Private notes ----
const manageNotes = [requireAuthenticated, requirePermission('notes:manage')];
router.get('/notes/:questionId', ...manageNotes, notes.getNote);
router.put('/notes/:questionId', ...manageNotes, notes.upsertNote);

// ---- Practice modes ----
router.get('/practice/random', attachUser, practice.random);
router.get('/practice/daily', attachUser, practice.daily);
router.get('/practice/topic/:slug', attachUser, practice.byTopic);
router.get('/practice/company/:slug', attachUser, practice.byCompany);
router.get('/practice/revision-queue', requireAuthenticated, requirePermission('revision:use'), practice.revisionQueue);
router.get('/practice/weak-topics', requireAuthenticated, requirePermission('progress:read'), practice.weakTopics);
router.get('/practice/mixed', attachUser, practice.mixed);
router.post('/practice/mock', attachUser, practice.mock);

// ---- Collections ----
router.get('/collections/companies', attachUser, collections.companies);
router.get('/collections/topics', attachUser, collections.topics);
router.get('/collections/sources', attachUser, collections.sources);

module.exports = router;
