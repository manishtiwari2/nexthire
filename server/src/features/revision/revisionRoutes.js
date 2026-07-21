const express = require('express');
const { getDueRevisions, updateRevisionReview } = require('./revisionController');
const { requireAuthenticated } = require('../auth/authMiddleware');

const router = express.Router();

router.get('/due', requireAuthenticated, getDueRevisions);
router.post('/review', requireAuthenticated, updateRevisionReview);

module.exports = router;
