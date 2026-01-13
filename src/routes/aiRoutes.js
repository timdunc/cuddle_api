import express from 'express';
import { auth } from '../middleware/auth.js';
import GroqService from '../services/GroqService.js';
import User from '../models/User.js';

const router = express.Router();

/**
 * POST /api/ai/chat
 * Interactive chat with The Divine Counsel
 */
router.post('/chat', auth, async (req, res) => {
    try {
        const { messages, context } = req.body;

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        // Fetch user preferences for context injection (if not provided by client)
        // We trust the client for gender usually, but we can double-check DB or use defaults
        // For now, allow client to pass 'context' (e.g., page they are on)

        // Enhance context with DB data if needed (e.g. partner name)
        // Since profile is encrypted, we rely on CLIENT passing the decrypted name/gender in 'context'
        // This is a trade-off for privacy. The AI "sees" what the client "shows" it for that session.

        const response = await GroqService.chatCompletion(req.user.id, messages, context);
        res.json(response);

    } catch (err) {
        console.error('[AI] Chat error:', err.message);
        if (err.message.includes('Depleted')) {
            return res.status(429).json({ error: err.message });
        }
        res.status(500).json({ error: 'Divine Counsel is currently meditating. Try again later.' });
    }
});

/**
 * GET /api/ai/usage
 * Get current token usage and limits
 */
router.get('/usage', auth, async (req, res) => {
    try {
        const usage = await GroqService.getUsage(req.user.id);
        res.json(usage);
    } catch (err) {
        console.error('[AI] Usage error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
