/**
 * Notification Routes
 * Handle subscribing/unsubscribing to push notifications
 */
import express from 'express';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/notifications/subscribe
 * Save push subscription for current user
 */
router.post('/subscribe', auth, async (req, res) => {
    try {
        const { subscription } = req.body;

        if (!subscription || !subscription.endpoint) {
            return res.status(400).json({ error: 'Invalid subscription' });
        }

        await User.findByIdAndUpdate(req.user.id, {
            pushSubscription: subscription
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[Notification] Subscribe error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/notifications/test
 * Test push (for dev)
 */
router.post('/test', auth, async (req, res) => {
    try {
        const { NotificationService } = await import('../services/NotificationService.js');
        await NotificationService.default.sendToUser(req.user.id, {
            title: 'Us.',
            body: 'This is a test notification.',
            type: 'TEST'
        });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed' });
    }
});

/**
 * POST /api/notifications/send-signal
 * Send push notification to partner when signal is sent
 */
router.post('/send-signal', auth, async (req, res) => {
    try {
        const { signalType, signalLabel } = req.body;

        // Get current user and their partner
        const user = await User.findById(req.user.id);
        if (!user || !user.partnerId) {
            return res.status(400).json({ error: 'No partner connected' });
        }

        // Send push notification to partner
        const NotificationService = (await import('../services/NotificationService.js')).default;
        await NotificationService.sendToUser(user.partnerId.toString(), {
            title: 'Us. 💕',
            body: signalLabel || 'Your partner sent you a signal',
            type: 'SIGNAL',
            data: { signalType }
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[Notification] Send signal error:', err.message);
        res.status(500).json({ error: 'Failed to send notification' });
    }
});

export default router;

