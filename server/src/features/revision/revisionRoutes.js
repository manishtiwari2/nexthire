const express = require('express');
const { requireAuthenticated } = require('../auth/authMiddleware');
const revision = require('./revisionController');

const router = express.Router();

// All revision endpoints are personal — auth required.
router.get('/queue', requireAuthenticated, revision.getQueue);
router.post('/review', requireAuthenticated, revision.review);
router.post('/enqueue', requireAuthenticated, revision.enqueue);
router.delete('/:questionId', requireAuthenticated, revision.remove);

module.exports = router;
