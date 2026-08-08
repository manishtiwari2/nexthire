const express = require('express');
const { requireAuthenticated, requirePermission } = require('../auth/authMiddleware');
const revision = require('./revisionController');

const router = express.Router();

// All revision endpoints are personal — auth required, and every record is scoped to
// req.user.id inside the service.
const useRevision = [requireAuthenticated, requirePermission('revision:use')];
router.get('/queue', ...useRevision, revision.getQueue);
router.post('/review', ...useRevision, revision.review);
router.post('/enqueue', ...useRevision, revision.enqueue);
router.delete('/:questionId', ...useRevision, revision.remove);

module.exports = router;
