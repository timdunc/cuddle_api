/**
 * User Model - Minimal user data (ciphertext only approach)
 * 
 * The server stores ONLY:
 * - Public ID (non-revealing)
 * - Encrypted profile blob
 * - Partner link (optional)
 * 
 * All personal data is encrypted client-side before storage.
 */

import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    // Non-revealing public identifier
    publicId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },

    // Encrypted profile data (name, preferences, etc.)
    // This is ciphertext - server cannot read it
    encryptedProfile: {
        ciphertext: String,
        iv: String,
    },

    // Partner connection (optional)
    partnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
    },

    // ECDH Public Key (Base64 SPKI)
    // Allows partners to derive shared secret
    publicKey: {
        type: String,
        default: null
    },

    // RSA Public Key (Base64 SPKI) for Hybrid Encryption
    rsaPublicKey: {
        type: String,
        default: null
    },

    // Partner invite code (for linking)
    inviteCode: {
        type: String,
        unique: true,
        sparse: true,
    },

    // Push notification subscription (Plain JSON for server use)
    pushSubscription: {
        endpoint: String,
        keys: {
            p256dh: String,
            auth: String,
        },
    },

    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now,
    },
    lastActiveAt: {
        type: Date,
        default: Date.now,
    },
    // Online status
    isOnline: {
        type: Boolean,
        default: false,
    },
    // Typing status for chat
    isTyping: {
        type: Boolean,
        default: false,
    },
    typingAt: {
        type: Date,
        default: null,
    },

    // Enhanced presence tracking
    isVisible: {
        type: Boolean,
        default: true, // If app tab is visible
    },
    isFocused: {
        type: Boolean,
        default: true, // If window has focus
    },
    status: {
        type: String,
        enum: ['online', 'away', 'offline'],
        default: 'offline',
    },

    // Partner Link Celebration Flag
    showConnectionCelebration: {
        type: Boolean,
        default: false,
    },

    // Partner-Assisted Recovery Blob
    // This is the user's MDK encrypted with the PARTNER'S Public Key.
    // The server can store it, but cannot decrypt it.
    // Only the partner can decrypt it to assist with recovery.
    partnerRecoveryBlob: {
        ciphertext: String,
        iv: String,
        ephemeralPublicKey: String // If using ECDH for blob
    },
});

// Update lastActiveAt on activity
userSchema.methods.updateActivity = function () {
    this.lastActiveAt = new Date();
    return this.save();
};

// Generate invite code
userSchema.methods.generateInviteCode = function () {
    // Simple 8-char code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    this.inviteCode = code;
    return this.save();
};

const User = mongoose.model('User', userSchema);
export default User;
