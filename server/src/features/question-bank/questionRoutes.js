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
const { requireAuthenticated, requireAdmin } = require('../auth/authMiddleware');

const router = express.Router();

router.get('/topics', getTopics);
router.get('/', getQuestions);
// Detail read is authenticated so hidden test cases can be scoped by role (see controller).
router.get('/:id', requireAuthenticated, getQuestionById);
router.get('/:id/submissions', requireAuthenticated, getUserSubmissionsForQuestion);
router.post('/', requireAuthenticated, requireAdmin, createQuestion);
router.put('/:id', requireAuthenticated, requireAdmin, updateQuestion);
router.delete('/:id', requireAuthenticated, requireAdmin, deleteQuestion);
router.post('/:id/execute', requireAuthenticated, submitCodeExecution);
router.get('/submission/:submissionId', requireAuthenticated, getSubmissionResult);

module.exports = router;
