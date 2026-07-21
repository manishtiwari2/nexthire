const express = require('express');
const { getDashboardStats } = require('./dashboardController');
const { requireAuthenticated } = require('../auth/authMiddleware');

const router = express.Router();

router.get('/stats', requireAuthenticated, getDashboardStats);

module.exports = router;
