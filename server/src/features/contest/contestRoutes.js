const express = require('express');
const {
  getContests,
  getContestById,
  createContest,
  joinContest,
  joinByCode,
  recordHeartbeat,
  getContestLeaderboard,
  createContestInvite,
  submitContestCode
} = require('./contestController');
const { requireAuthenticated, requireAdmin, requireContestHost } = require('../auth/authMiddleware');

const router = express.Router();

router.get('/', getContests);
router.post('/join-by-code', requireAuthenticated, joinByCode);
// Detail read is authenticated so invite codes can be scoped to host/admin (see controller).
router.get('/:id', requireAuthenticated, getContestById);
router.get('/:id/leaderboard', getContestLeaderboard);
router.post('/', requireAuthenticated, requireAdmin, createContest);
router.post('/:id/join', requireAuthenticated, joinContest);
router.post('/:id/heartbeat', requireAuthenticated, recordHeartbeat);
router.post('/:id/submit', requireAuthenticated, submitContestCode);
router.post('/:id/invites', requireAuthenticated, requireContestHost, createContestInvite);

module.exports = router;
