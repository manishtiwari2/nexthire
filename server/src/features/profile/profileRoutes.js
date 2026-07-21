const express = require('express');
const { getProfile, updateProfile } = require('./profileController');
const { requireAuthenticated } = require('../auth/authMiddleware');

const router = express.Router();

router.get('/', requireAuthenticated, getProfile);
router.put('/', requireAuthenticated, updateProfile);

module.exports = router;
