const express = require('express');
const { getUserNotifications, markAsRead, markAllAsRead, broadcastNotification, deleteNotification } = require('./notificationController');
const { requireAuthenticated, requireAdmin } = require('../auth/authMiddleware');

const router = express.Router();

router.get('/', requireAuthenticated, getUserNotifications);
router.put('/read-all', requireAuthenticated, markAllAsRead);
router.put('/:id/read', requireAuthenticated, markAsRead);
router.delete('/:id', requireAuthenticated, deleteNotification);
router.post('/broadcast', requireAuthenticated, requireAdmin, broadcastNotification);

module.exports = router;
