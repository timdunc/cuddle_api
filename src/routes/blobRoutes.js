/**
 * Blob Routes - CRUD for encrypted blob storage
 * 
 * All data is ciphertext - the server never sees plaintext.
 * This is a "dumb" blob storage - just store and retrieve.
 */

import express from 'express';
import Blob from '../models/Blob.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/blobs
 * Create a new encrypted blob
 */
router.post('/', auth, async (req, res) => {
    try {
        const { type, ciphertext, iv, recipientId, encryptedMeta } = req.body;

        // Only type and ciphertext are required - iv is optional for shared plaintext
        if (!type || !ciphertext) {
            return res.status(400).json({ error: 'type and ciphertext are required' });
        }

        const blob = new Blob({
            userId: req.user.id,
            type,
            ciphertext,
            iv: iv || '', // Allow empty iv for plaintext shared content
            recipientId: recipientId || null,
            encryptedMeta: encryptedMeta || null,
        });

        await blob.save();

        res.status(201).json({
            id: blob._id,
            type: blob.type,
            createdAt: blob.createdAt,
        });
    } catch (err) {
        console.error('[Blob] Create error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /api/blobs
 * List user's blobs (with optional type filter)
 */
router.get('/', auth, async (req, res) => {
    try {
        const { type, limit = 50, offset = 0 } = req.query;

        const query = { userId: req.user.id };
        if (type) {
            query.type = type;
        }

        const blobs = await Blob.find(query)
            .sort({ createdAt: -1 })
            .skip(parseInt(offset))
            .limit(parseInt(limit))
            .select('_id type ciphertext iv encryptedMeta createdAt updatedAt');

        const total = await Blob.countDocuments(query);

        res.json({
            blobs,
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
        });
    } catch (err) {
        console.error('[Blob] List error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /api/blobs/shared
 * List blobs shared between user and partner (both sent and received)
 * This returns all messages in a conversation for proper chat display
 */
router.get('/shared', auth, async (req, res) => {
    try {
        const { type, limit = 50, offset = 0 } = req.query;

        // Get messages where user is either sender or recipient
        // This enables proper chat display with own messages on right, partner's on left
        const query = {
            $or: [
                { userId: req.user.id },       // Messages sent by user
                { recipientId: req.user.id }   // Messages received by user
            ]
        };
        if (type) {
            query.type = type;
        }

        const blobs = await Blob.find(query)
            .sort({ createdAt: -1 })
            .skip(parseInt(offset))
            .limit(parseInt(limit))
            .select('_id userId type ciphertext iv encryptedMeta createdAt');

        res.json({
            blobs,
            total: await Blob.countDocuments(query),
        });
    } catch (err) {
        console.error('[Blob] Shared list error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * GET /api/blobs/:id
 * Get a specific blob
 */
router.get('/:id', auth, async (req, res) => {
    try {
        const blob = await Blob.findOne({
            _id: req.params.id,
            $or: [
                { userId: req.user.id },
                { recipientId: req.user.id },
            ],
        });

        if (!blob) {
            return res.status(404).json({ error: 'Blob not found' });
        }

        res.json(blob);
    } catch (err) {
        console.error('[Blob] Get error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * PUT /api/blobs/:id
 * Update a blob (replace ciphertext)
 */
router.put('/:id', auth, async (req, res) => {
    try {
        const { ciphertext, iv, encryptedMeta } = req.body;

        const blob = await Blob.findOne({
            _id: req.params.id,
            userId: req.user.id, // Only owner can update
        });

        if (!blob) {
            return res.status(404).json({ error: 'Blob not found' });
        }

        if (ciphertext) blob.ciphertext = ciphertext;
        if (iv) blob.iv = iv;
        if (encryptedMeta) blob.encryptedMeta = encryptedMeta;

        await blob.save();

        res.json({
            id: blob._id,
            updatedAt: blob.updatedAt,
        });
    } catch (err) {
        console.error('[Blob] Update error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * DELETE /api/blobs/:id
 * Delete a blob
 */
router.delete('/:id', auth, async (req, res) => {
    try {
        const result = await Blob.deleteOne({
            _id: req.params.id,
            userId: req.user.id, // Only owner can delete
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Blob not found' });
        }

        res.json({ message: 'Blob deleted' });
    } catch (err) {
        console.error('[Blob] Delete error:', err.message);
        res.status(500).json({ error: 'Server error' });
    }
});

export default router;
