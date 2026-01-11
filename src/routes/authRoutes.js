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
 * Create a new user with encrypted profile AND public key
 */
router.post('/register', async (req, res) => {
    try {
        const { encryptedProfile, publicKey, rsaPublicKey } = req.body;

        // Generate unique public ID
        const publicId = crypto.randomBytes(16).toString('hex');

        // Create user
        const user = new User({
            publicId,
            encryptedProfile: encryptedProfile || null,
            publicKey: publicKey || null, // Save ECDH Public Key
            rsaPublicKey: rsaPublicKey || null // Save RSA Public Key
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
                publicKey: user.publicKey,
                rsaPublicKey: user.rsaPublicKey,
            },
        });
    } catch (err) {
        console.error('[Auth] Register error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/auth/recover
 * Recover account using ECDH Public Key (Identity Restoration)
 */
router.post('/recover', async (req, res) => {
    try {
        const { publicKey } = req.body;

        if (!publicKey) {
            return res.status(400).json({ error: 'Public Key required' });
        }

        // Find user by their cryptographic signature (Public Key)
        const user = await User.findOne({ publicKey });

        if (!user) {
            // No user maps to this key -> They are truly new, or keys were rotated
            return res.status(404).json({ error: 'Identity not found' });
        }

        console.log(`[Auth] Identity recovered for user ${user.publicId}`);

        res.json({
            found: true,
            publicId: user.publicId,
            inviteCode: user.inviteCode
        });
    } catch (err) {
        console.error('[Auth] Recovery error:', err.message);
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
                showConnectionCelebration: user.showConnectionCelebration,
                publicKey: user.publicKey,
                rsaPublicKey: user.rsaPublicKey,
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
            showConnectionCelebration: user.showConnectionCelebration,
            publicKey: user.publicKey,
            rsaPublicKey: user.rsaPublicKey,
        });
    } catch (err) {
        console.error('[Auth] Me error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/auth/upload-key
 * Upload ECDH Public Key (Migration for existing users)
 */
router.post('/upload-key', auth, async (req, res) => {
    try {
        const { publicKey } = req.body;

        if (!publicKey) {
            return res.status(400).json({ error: 'Public Key required' });
        }

        await User.findByIdAndUpdate(req.user.id, { publicKey });

        res.json({ message: 'Public Key uploaded successfully' });
    } catch (err) {
        console.error('[Auth] Upload Key error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/auth/upload-rsa-key
 * Upload RSA Public Key (Migration for existing users)
 */
router.post('/upload-rsa-key', auth, async (req, res) => {
    try {
        const { rsaPublicKey } = req.body;

        if (!rsaPublicKey) {
            return res.status(400).json({ error: 'RSA Public Key required' });
        }

        await User.findByIdAndUpdate(req.user.id, { rsaPublicKey });

        res.json({ message: 'RSA Public Key uploaded successfully' });
    } catch (err) {
        console.error('[Auth] Upload RSA Key error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/auth/recovery-blob
 * Upload secure recovery blob (encrypted MDK for partner)
 */
router.post('/recovery-blob', auth, async (req, res) => {
    try {
        const { blob } = req.body;
        if (!blob || !blob.ciphertext || !blob.ephemeralPublicKey) {
            return res.status(400).json({ error: 'Invalid blob format' });
        }

        await User.findByIdAndUpdate(req.user.id, {
            partnerRecoveryBlob: blob
        });

        res.json({ message: 'Recovery blob saved' });
    } catch (err) {
        console.error('[Auth] Recovery blob error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});



/**
 * POST /api/auth/recovery-request
 * Ask partner for help. Sends push notification with ephemeral key.
 */
router.post('/recovery-request', auth, async (req, res) => {
    try {
        const { ephemeralPublicKey } = req.body;
        const user = await User.findById(req.user.id);

        if (!user.partnerId) {
            return res.status(400).json({ error: 'No partner linked' });
        }

        // Notify Partner
        const { default: NotificationService } = await import('../services/NotificationService.js');
        await NotificationService.sendToUser(user.partnerId, {
            title: 'Partner needs help unlocking!',
            body: 'Tap to assist your partner with account recovery.',
            type: 'RECOVERY_REQUEST',
            payload: {
                requestorId: user._id,
                ephemeralPublicKey: ephemeralPublicKey
            }
        });

        res.json({ message: 'Request sent to partner' });
    } catch (err) {
        console.error('[Auth] Recovery request error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});



/**
 * GET /api/auth/partner-recovery-blob
 * Fetch the blob for my partner (so I can help them)
 */
router.get('/partner-recovery-blob', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user.partnerId) return res.status(404).json({ error: 'No partner' });

        const partner = await User.findById(user.partnerId);
        if (!partner || !partner.partnerRecoveryBlob) {
            return res.status(404).json({ error: 'Partner has not backed up their keys' });
        }

        res.json(partner.partnerRecoveryBlob);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/auth/recovery-response
 * Send the help (decrypted/re-encrypted blob) back to partner
 */
router.post('/recovery-response', auth, async (req, res) => {
    try {
        const { responsePayload } = req.body;
        const user = await User.findById(req.user.id);

        if (!user.partnerId) return res.status(400).json({ error: 'No partner' });

        // Notify Partner (The one who is locked out)
        const { default: NotificationService } = await import('../services/NotificationService.js');
        await NotificationService.sendToUser(user.partnerId, {
            title: 'Help Received!',
            body: 'Your partner has approved the unlock request. Tap to restore access.',
            type: 'RECOVERY_RESPONSE',
            payload: responsePayload
        });

        res.json({ message: 'Response sent' });

    } catch (err) {
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

        // Trigger celebration for both
        user.showConnectionCelebration = true;
        partner.showConnectionCelebration = true;

        await user.save();
        await partner.save();

        // Notify partner
        const { default: NotificationService } = await import('../services/NotificationService.js');
        await NotificationService.sendToUser(partner._id, {
            title: 'Partner Connected',
            body: 'Your partner has linked with you!',
            type: 'PARTNER_LINKED'
        });

        // Notify partner via Socket (Instant)
        if (req.io) {
            req.io.to(partner._id.toString()).emit('partner-status', {
                userId: req.user.id,
                isOnline: true,
                showConnectionCelebration: true
            });
            // Also emit a specific event for the celebration trigger if needed, 
            // but partner-status update should be enough if the client handles it.
            // Let's be explicit for the "Event" listener approach.
            req.io.to(partner._id.toString()).emit('notification', {
                type: 'PARTNER_LINKED',
                partnerId: user._id,
                partnerName: user.encryptedProfile || 'Partner' // We don't have decrypted name, but UI handles "Partner"
            });
        }

        res.json({
            message: 'Successfully linked with partner',
            partnerId: partner._id,
            partnerPublicKey: partner.publicKey,
            partnerRSAPublicKey: partner.rsaPublicKey,
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
/**
 * GET /api/auth/sync-status
 * Lightweight endpoint to get all latest timestamps in one go.
 * Used for high-frequency polling (1s interval).
 */
router.get('/sync-status', auth, async (req, res) => {
    try {
        const myId = req.user._id;
        const partnerId = req.user.partnerId;

        if (!partnerId) {
            return res.json({
                lastActiveAt: null,
                isOnline: false,
                isTyping: false,
                latestChat: null,
                latestSignal: null,
                latestPrayer: null
            });
        }

        const partner = await User.findById(partnerId);

        // Parallel queries - optimized for speed (using .sort().limit(1) and projection)
        const [lastMsg, lastSignal, lastPrayer, lastGrowth, lastScripture, lastHelpful] = await Promise.all([
            // 1. Chat: Latest message FROM partner
            Blob.findOne({ userId: partnerId, type: 'message' })
                .sort({ createdAt: -1 })
                .select('createdAt')
                .lean(),

            // 2. Signal: Latest signal
            // Assuming signals are stored as specific blob strings or separate collection?
            // "Signal" type is usually ephemeral but let's check blobs with type 'signal'
            // Actually, based on previous context, signals are generic blobs too?
            // Wait, signals are sent as blobs.
            Blob.findOne({ userId: partnerId, type: 'signal' }) // Adjust if type differs
                .sort({ createdAt: -1 })
                .select('createdAt')
                .lean(),

            // 3. Prayer
            Blob.findOne({ userId: partnerId, type: 'shared-prayer' })
                .sort({ createdAt: -1 })
                .select('createdAt')
                .lean(),

            // 4. Growth
            Blob.findOne({ userId: partnerId, type: 'shared-growth' })
                .sort({ createdAt: -1 })
                .select('createdAt')
                .lean(),

            // 5. Shared Scripture (Explicit Share)
            Blob.findOne({ userId: partnerId, type: 'shared-verse' })
                .sort({ createdAt: -1 })
                .select('createdAt')
                .lean(),

            // 6. Helpful Scripture (Marked as Helpful)
            Blob.findOne({ userId: partnerId, type: 'helpful-verse' })
                .sort({ createdAt: -1 })
                .select('createdAt')
                .lean(),
        ]);

        const TIMEOUT_MS = 20 * 1000;
        const now = Date.now();
        const lastActive = partner.lastActiveAt ? new Date(partner.lastActiveAt).getTime() : 0;
        const isOnline = (now - lastActive) < TIMEOUT_MS;

        res.json({
            lastActiveAt: partner.lastActiveAt,
            isOnline,
            isTyping: partner.isTyping || false,
            // Return timestamps directly
            latestChat: lastMsg?.createdAt || null,
            latestSignal: lastSignal?.createdAt || null,
            latestPrayer: lastPrayer?.createdAt || lastGrowth?.createdAt || null // Combined for "Prayer" tab
        });

    } catch (err) {
        console.error('[Auth] Sync Status error:', err.message);
        // Fail silently/gracefully for polling
        res.json({});
    }
});

// Update Partner Status (Old route - keep for compatibility or eventually deprecate)
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

        // Consider "online" if active in last 20 seconds
        const TIMEOUT_MS = 20 * 1000;
        const now = Date.now();
        const lastActive = new Date(partner.lastActiveAt).getTime();
        const isRecentlyActive = (now - lastActive) < TIMEOUT_MS;

        // If marked online but inactive > 2 mins, force offline
        if (partner.isOnline && !isRecentlyActive) {
            partner.isOnline = false;
            await partner.save();
        }

        // Check if partner is typing (typing expires after 5 seconds)
        const typingTimeout = new Date(Date.now() - 5 * 1000);
        const isTyping = partner.isTyping && partner.typingAt > typingTimeout;

        res.json({
            connected: !!user.partnerId,
            partnerId: user.partnerId,
            isOnline: partner.isOnline,
            showConnectionCelebration: user.showConnectionCelebration,
            lastActive: partner.lastActiveAt,
            isTyping: isTyping,
            partnerPublicKey: partner.publicKey,
            partnerRSAPublicKey: partner.rsaPublicKey,
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

/**
 * POST /api/auth/ack-celebration
 * Acknowledge connection celebration
 */
router.post('/ack-celebration', auth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.id, { showConnectionCelebration: false });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/auth/me
 * Self-destruct: Delete user, blobs, and unlink partner
 */
router.delete('/me', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // 1. Notify Partner (if any)
        if (user.partnerId) {
            const partnerId = user.partnerId;

            // Unlink partner
            await User.findByIdAndUpdate(partnerId, {
                partnerId: null,      // Remove link
                isOnline: false,      // Force refresh logic on their end eventually
                publicKey: null       // Remove cached public key if any (though stored in client)
            });

            // Send notification to partner
            try {
                const NotificationService = (await import('../services/NotificationService.js')).default;
                await NotificationService.sendToUser(partnerId.toString(), {
                    title: 'Partner Left',
                    body: 'Your partner has disconnected.',
                    type: 'PARTNER_LEFT'
                });
            } catch (notifyErr) {
                console.error('[Auth] Failed to notify partner of exit', notifyErr);
            }
        }

        // 2. Delete All Blobs (Encrypted Data)
        const blobImport = await import('../models/Blob.js');
        const Blob = blobImport.default;
        await Blob.deleteMany({ userId: userId });

        // 3. Delete User Profile
        await User.findByIdAndDelete(userId);

        console.log(`[Auth] User ${userId} performed self-destruct.`);
        res.json({ message: 'Account deleted' });

    } catch (err) {
        console.error('[Auth] Delete account error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
