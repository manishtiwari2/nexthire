const express = require('express');
const { googleLogin, login, getMe } = require('./authController');
const { requireAuthenticated } = require('./authMiddleware');

const router = express.Router();

router.post('/google', googleLogin);
router.post('/login', login);
router.get('/me', requireAuthenticated, getMe);

module.exports = router;
