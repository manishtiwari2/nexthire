const express = require('express');
const {
  getContests,
  getContestById,
  createContest,
  joinContest,
  recordHeartbeat,
  getContestLeaderboard,
  createContestInvite,
  submitContestCode
} = require('./contestController');
const { requireAuthenticated, requireAdmin, requireContestHost } = require('../auth/authMiddleware');

const router = express.Router();

router.get('/', getContests);
router.get('/:id', getContestById);
router.get('/:id/leaderboard', getContestLeaderboard);
router.post('/', requireAuthenticated, requireAdmin, createContest);
router.post('/:id/join', requireAuthenticated, joinContest);
router.post('/:id/heartbeat', requireAuthenticated, recordHeartbeat);
router.post('/:id/submit', requireAuthenticated, submitContestCode);
router.post('/:id/invites', requireAuthenticated, requireContestHost, createContestInvite);

module.exports = router;
