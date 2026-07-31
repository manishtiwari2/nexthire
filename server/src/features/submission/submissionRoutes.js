const express = require('express');
const {
  getSubmission,
  getExecutionResult,
  listSubmissions,
  rejudgeSubmission,
  cancelSubmission
} = require('./submissionController');
const { requireAuthenticated, requireAdmin } = require('../auth/authMiddleware');

const router = express.Router();

// All submission endpoints require authentication; per-record ownership is checked in the
// controller (a user may only read/cancel their own; admins may read any and rejudge).
router.get('/', requireAuthenticated, listSubmissions);
router.get('/:id', requireAuthenticated, getSubmission);
router.get('/:id/result', requireAuthenticated, getExecutionResult);
router.post('/:id/rejudge', requireAuthenticated, requireAdmin, rejudgeSubmission);
router.post('/:id/cancel', requireAuthenticated, cancelSubmission);

module.exports = router;
