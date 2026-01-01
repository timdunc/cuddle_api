/**
 * Auth Routes - User registration and login
 * 
 * Note: The server only stores encrypted data.
 * Authentication is based on publicId, not email/password.
 * The client derives the actual encryption key locally.
 */

import express from 'express';
import crypto from 'crypto';
import User from '../models/User.js';
import { generateToken, auth } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * Create a new user with encrypted profile
 */
router.post('/register', async (req, res) => {
    try {
        const { encryptedProfile } = req.body;

        // Generate unique public ID
        const publicId = crypto.randomBytes(16).toString('hex');

        // Create user
        const user = new User({
            publicId,
            encryptedProfile: encryptedProfile || null,
        });

        await user.save();

        // Generate invite code for partner linking
        await user.generateInviteCode();

        // Generate JWT
        const token = generateToken(user._id.toString());

        res.status(201).json({
            token,
            user: {
                id: user._id,
                publicId: user.publicId,
                inviteCode: user.inviteCode,
            },
        });
    } catch (err) {
        console.error('[Auth] Register error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/auth/login
 * Login with publicId (client validates password locally)
 */
router.post('/login', async (req, res) => {
    try {
        const { publicId } = req.body;

        if (!publicId) {
            return res.status(400).json({ error: 'Public ID required' });
        }

        const user = await User.findOne({ publicId });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update last active and set online
        user.lastActiveAt = new Date();
        user.isOnline = true;
        await user.save();

        // Generate JWT
        const token = generateToken(user._id.toString());

        res.json({
            token,
            user: {
                id: user._id,
                publicId: user.publicId,
                encryptedProfile: user.encryptedProfile,
                partnerId: user.partnerId,
                inviteCode: user.inviteCode,
            },
        });
    } catch (err) {
        console.error('[Auth] Login error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /api/auth/me
 * Get current user (protected)
 */
router.get('/me', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-__v');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Update activity status on every /me call (keeps user "online")
        user.lastActiveAt = new Date();
        user.isOnline = true;
        await user.save();

        res.json({
            id: user._id,
            publicId: user.publicId,
            encryptedProfile: user.encryptedProfile,
            partnerId: user.partnerId,
            inviteCode: user.inviteCode,
        });
    } catch (err) {
        console.error('[Auth] Me error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/auth/link-partner
 * Link with partner using invite code
 */
router.post('/link-partner', auth, async (req, res) => {
    try {
        const { inviteCode } = req.body;

        if (!inviteCode) {
            return res.status(400).json({ error: 'Invite code required' });
        }

        const partner = await User.findOne({ inviteCode: inviteCode.toUpperCase() });

        if (!partner) {
            return res.status(404).json({ error: 'Invalid invite code' });
        }

        if (partner._id.toString() === req.user.id) {
            return res.status(400).json({ error: 'Cannot link with yourself' });
        }

        if (partner.partnerId) {
            return res.status(400).json({ error: 'Partner already linked' });
        }

        const user = await User.findById(req.user.id);

        if (user.partnerId) {
            return res.status(400).json({ error: 'You are already linked' });
        }

        // Link both users
        user.partnerId = partner._id;
        partner.partnerId = user._id;

        await user.save();
        await partner.save();

        // Notify partner
        const { default: NotificationService } = await import('../services/NotificationService.js');
        await NotificationService.sendToUser(partner._id, {
            title: 'Partner Connected',
            body: 'Your partner has linked with you!',
            type: 'PARTNER_LINKED'
        });

        res.json({
            message: 'Successfully linked with partner',
            partnerId: partner._id,
        });
    } catch (err) {
        console.error('[Auth] Link partner error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /api/auth/partner-status
 * Get partner's online status
 */
router.get('/partner-status', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || !user.partnerId) {
            return res.json({ connected: false });
        }

        const partner = await User.findById(user.partnerId);
        if (!partner) {
            return res.json({ connected: false });
        }

        // Consider "online" if active in last 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const isRecentlyActive = partner.lastActiveAt > fiveMinutesAgo;

        // Check if partner is typing (typing expires after 5 seconds)
        const typingTimeout = new Date(Date.now() - 5 * 1000);
        const isTyping = partner.isTyping && partner.typingAt > typingTimeout;

        res.json({
            connected: true,
            isOnline: partner.isOnline && isRecentlyActive,
            lastActive: partner.lastActiveAt,
            isTyping: isTyping,
        });
    } catch (err) {
        console.error('[Auth] Partner status error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/auth/logout
 * Set user offline
 */
router.post('/logout', auth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.id, { isOnline: false });
        res.json({ message: 'Logged out' });
    } catch (err) {
        console.error('[Auth] Logout error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/auth/heartbeat
 * Update activity timestamp
 */
router.post('/heartbeat', auth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.id, {
            lastActiveAt: new Date(),
            isOnline: true
        });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/auth/typing
 * Update typing status
 */
router.post('/typing', auth, async (req, res) => {
    try {
        const { isTyping } = req.body;
        await User.findByIdAndUpdate(req.user.id, {
            isTyping: isTyping === true,
            typingAt: isTyping ? new Date() : null,
        });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;

