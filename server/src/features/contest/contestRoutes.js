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
const {
  requireAuthenticated,
  requirePermission,
  requireEmailVerified,
  requireContestHost,
  attachUser,
} = require('../auth/authMiddleware');

const router = express.Router();

/** Taking part in a contest writes durable state, so it needs a verified account. */
const participate = [requireAuthenticated, requireEmailVerified, requirePermission('contest:participate')];

// Browsing the contest list is public; the controller decides what a guest may see.
router.get('/', attachUser, getContests);
router.post('/join-by-code', ...participate, joinByCode);
// Detail read is authenticated so invite codes can be scoped to host/admin (see controller).
router.get('/:id', requireAuthenticated, getContestById);
router.get('/:id/leaderboard', attachUser, getContestLeaderboard);
router.post(
  '/',
  requireAuthenticated,
  requireEmailVerified,
  requirePermission('contest:manage'),
  createContest
);
router.post('/:id/join', ...participate, joinContest);
router.post('/:id/heartbeat', requireAuthenticated, requirePermission('contest:participate'), recordHeartbeat);
router.post('/:id/submit', ...participate, submitContestCode);
router.post('/:id/invites', requireAuthenticated, requireEmailVerified, requireContestHost, createContestInvite);

module.exports = router;
