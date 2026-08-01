const jwt = require('jsonwebtoken');
const { prisma } = require('../../shared/db');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}
const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'nexthire_dev_secret_key_2026';

function requireAuthenticated(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication token required' });
  }

  jwt.verify(token, EFFECTIVE_JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  });
}

// Soft authentication: if a valid bearer token is present, attach `req.user`; otherwise
// continue anonymously. Lets public endpoints (e.g. browsing the library) personalise
// results for signed-in users without rejecting anonymous visitors.
function attachUser(req, _res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return next();

  jwt.verify(token, EFFECTIVE_JWT_SECRET, (err, decoded) => {
    if (!err) req.user = decoded;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, error: 'Requires ADMIN permission' });
  }
  next();
}

async function requireContestParticipant(req, res, next) {
  try {
    const contestId = req.params.contestId || req.params.id;
    if (!contestId) return next();

    const participant = await prisma.contestParticipant.findUnique({
      where: { contestId_userId: { contestId, userId: req.user.id } }
    });

    if (!participant && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Must be a registered contest participant' });
    }

    req.contestParticipant = participant;
    next();
  } catch (err) {
    next(err);
  }
}

async function requireContestHost(req, res, next) {
  try {
    const contestId = req.params.contestId || req.params.id;
    if (!contestId) return next();

    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) {
      return res.status(404).json({ success: false, error: 'Contest not found' });
    }

    if (contest.hostId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Requires Contest Host permission' });
    }

    req.contest = contest;
    next();
  } catch (err) {
    next(err);
  }
}

async function requireInterviewHost(req, res, next) {
  try {
    const interviewId = req.params.interviewId || req.params.id;
    if (!interviewId) return next();

    const interview = await prisma.interview.findUnique({ where: { id: interviewId } });
    if (!interview) {
      return res.status(404).json({ success: false, error: 'Interview session not found' });
    }

    if (interview.hostId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Requires Interview Host permission' });
    }

    req.interview = interview;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requireAuthenticated,
  attachUser,
  requireAdmin,
  requireContestParticipant,
  requireContestHost,
  requireInterviewHost,
  JWT_SECRET: EFFECTIVE_JWT_SECRET
};
