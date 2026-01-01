/**
 * WebRTC Signaling Routes
 * Handles offer/answer exchange for peer-to-peer audio connections
 */
import express from 'express';
import User from '../models/User.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// In-memory signaling store (for simplicity - could use Redis for scale)
const signalingStore = new Map();

/**
 * POST /api/webrtc/offer
 * Send WebRTC offer to partner
 */
router.post('/offer', auth, async (req, res) => {
    try {
        const { sdp } = req.body;
        if (!sdp) {
            return res.status(400).json({ error: 'SDP offer required' });
        }

        const user = await User.findById(req.user.id);
        if (!user || !user.partnerId) {
            return res.status(400).json({ error: 'No partner connected' });
        }

        // Store offer for partner to poll
        const partnerKey = user.partnerId.toString();
        signalingStore.set(partnerKey, {
            type: 'offer',
            sdp,
            from: req.user.id,
            timestamp: Date.now()
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[WebRTC] Offer error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/webrtc/answer
 * Send WebRTC answer to partner
 */
router.post('/answer', auth, async (req, res) => {
    try {
        const { sdp } = req.body;
        if (!sdp) {
            return res.status(400).json({ error: 'SDP answer required' });
        }

        const user = await User.findById(req.user.id);
        if (!user || !user.partnerId) {
            return res.status(400).json({ error: 'No partner connected' });
        }

        // Store answer for partner to poll
        const partnerKey = user.partnerId.toString();
        signalingStore.set(partnerKey, {
            type: 'answer',
            sdp,
            from: req.user.id,
            timestamp: Date.now()
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[WebRTC] Answer error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/webrtc/ice-candidate
 * Exchange ICE candidates
 */
router.post('/ice-candidate', auth, async (req, res) => {
    try {
        const { candidate } = req.body;

        const user = await User.findById(req.user.id);
        if (!user || !user.partnerId) {
            return res.status(400).json({ error: 'No partner connected' });
        }

        const partnerKey = `ice-${user.partnerId.toString()}`;
        const existing = signalingStore.get(partnerKey) || [];
        existing.push({ candidate, from: req.user.id, timestamp: Date.now() });
        signalingStore.set(partnerKey, existing);

        res.json({ success: true });
    } catch (err) {
        console.error('[WebRTC] ICE error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /api/webrtc/poll
 * Poll for incoming offers/answers/ICE candidates
 */
router.get('/poll', auth, async (req, res) => {
    try {
        const myKey = req.user.id;
        const iceKey = `ice-${req.user.id}`;

        const signal = signalingStore.get(myKey);
        const iceCandidates = signalingStore.get(iceKey) || [];

        // Clear after reading
        if (signal) signalingStore.delete(myKey);
        if (iceCandidates.length > 0) signalingStore.delete(iceKey);

        res.json({
            signal: signal || null,
            iceCandidates
        });
    } catch (err) {
        console.error('[WebRTC] Poll error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * POST /api/webrtc/end
 * Signal end of audio session
 */
router.post('/end', auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user || !user.partnerId) {
            return res.json({ success: true });
        }

        // Signal partner that session ended
        const partnerKey = user.partnerId.toString();
        signalingStore.set(partnerKey, {
            type: 'end',
            from: req.user.id,
            timestamp: Date.now()
        });

        res.json({ success: true });
    } catch (err) {
        console.error('[WebRTC] End error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
