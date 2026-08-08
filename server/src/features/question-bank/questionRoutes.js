const express = require('express');
const {
  getQuestions,
  getQuestionById,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  submitCodeExecution,
  getSubmissionResult,
  getUserSubmissionsForQuestion,
  getTopics
} = require('./questionController');
const {
  requireAuthenticated,
  requirePermission,
  requireEmailVerified,
  attachUser,
} = require('../auth/authMiddleware');

const router = express.Router();

// Question management is admin-only; browsing is open. Writes additionally require a
// verified email so an unconfirmed signup cannot create durable state.
const manageQuestions = [requireAuthenticated, requirePermission('question:manage')];

router.get('/topics', getTopics);
// Soft-auth: personalise browse (solved/bookmarked/revision-due filters + progress badges)
// for signed-in users while staying open to anonymous visitors.
router.get('/', attachUser, getQuestions);
// Detail read is authenticated so hidden test cases can be scoped by role (see controller).
router.get('/:id', requireAuthenticated, getQuestionById);
router.get('/:id/submissions', requireAuthenticated, getUserSubmissionsForQuestion);
router.post('/', ...manageQuestions, createQuestion);
router.put('/:id', ...manageQuestions, updateQuestion);
router.delete('/:id', ...manageQuestions, deleteQuestion);
router.post(
  '/:id/execute',
  requireAuthenticated,
  requireEmailVerified,
  requirePermission('submission:create'),
  submitCodeExecution
);
router.get('/submission/:submissionId', requireAuthenticated, getSubmissionResult);

module.exports = router;
