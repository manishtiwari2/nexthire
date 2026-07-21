const express = require('express');
const { getInterviews, getInterviewById, scheduleInterview, createInterviewReport } = require('./interviewController');
const { requireAuthenticated, requireInterviewHost } = require('../auth/authMiddleware');

const router = express.Router();

router.get('/', requireAuthenticated, getInterviews);
router.get('/:id', requireAuthenticated, getInterviewById);
router.post('/', requireAuthenticated, scheduleInterview);
router.post('/:id/report', requireAuthenticated, requireInterviewHost, createInterviewReport);

module.exports = router;
