/**
 * Blob Model - Encrypted data storage
 * 
 * ALL data stored is ciphertext. The server has zero knowledge
 * of the actual content. Types of blobs:
 * - journal: Personal growth entries
 * - prayer: Prayer journal entries
 * - message: Partner messages
 * - note: Shared notes
 */

import mongoose from 'mongoose';

const blobSchema = new mongoose.Schema({
    // Owner of this blob
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },

    // Blob type for organization
    type: {
        type: String,
        enum: ['journal', 'prayer', 'message', 'note', 'growth', 'signal', 'shared-growth', 'shared-prayer', 'other'],
        required: true,
        index: true,
    },

    // The encrypted data - server cannot read this
    ciphertext: {
        type: String,
        required: true,
    },

    // Initialization vector for decryption (optional for plaintext shared content)
    iv: {
        type: String,
        required: false,
        default: '',
    },

    // Optional: recipient for shared blobs (messages, notes)
    recipientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true,
    },

    // Optional: encrypted metadata (for search, sorting client-side)
    encryptedMeta: {
        ciphertext: String,
        iv: String,
    },

    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now,
        index: true,
    },
    updatedAt: {
        type: Date,
        default: Date.now,
    },
});

// Update timestamp on save
blobSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

// Compound indexes for efficient queries
blobSchema.index({ userId: 1, type: 1, createdAt: -1 });
blobSchema.index({ recipientId: 1, createdAt: -1 });

const Blob = mongoose.model('Blob', blobSchema);
export default Blob;
