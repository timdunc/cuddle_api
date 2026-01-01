/**
 * cuddle. Backend Server
 * 
 * Minimal backend for encrypted blob transport.
 * All data received is ciphertext - server has zero knowledge.
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Routes
import authRoutes from './routes/authRoutes.js';
import blobRoutes from './routes/blobRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';

// Load environment variables
dotenv.config();

const app = express();

// =============================================================================
// Security Middleware
// =============================================================================

// Helmet for security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            connectSrc: ["'self'", process.env.CLIENT_URL || 'https://localhost:3000'],
        },
    },
}));

// CORS
app.use(cors({
    origin: process.env.CLIENT_URL || 'https://localhost:3000',
    credentials: true,
}));

// Rate limiting - generous limits for partner communication
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10000, // Allow many requests for real-time messaging
    message: { error: 'Too many requests, please try again later.' },
});
app.use('/api', limiter); // Apply rate limiting to all /api routes

// Body parsing (for encrypted blobs)
app.use(express.json({ limit: '50kb' })); // Increased for messages with emojis

// =============================================================================
// Routes
// =============================================================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
    });
});

// API info
app.get('/api', (req, res) => {
    res.json({
        name: 'Us. API',
        version: '1.0.0',
        description: 'Partner connection - zero knowledge encryption',
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/blobs', blobRoutes);
app.use('/api/notifications', notificationRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('[Error]', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// =============================================================================
// Database & Server Start
// =============================================================================

const PORT = process.env.PORT || 5000;

async function startServer() {
    try {
        // Connect to MongoDB
        if (process.env.MONGODB_URI) {
            await mongoose.connect(process.env.MONGODB_URI);
            console.log('[DB] Connected to MongoDB');
        } else {
            console.log('[DB] Running without database (development mode)');
        }

        // Start server
        app.listen(PORT, () => {
            console.log(`[Server] cuddle. backend running on port ${PORT}`);
            console.log(`[Server] Environment: ${process.env.NODE_ENV}`);
            console.log('[Server] Zero-knowledge encryption - backend sees only ciphertext');
        });
    } catch (error) {
        console.error('[Server] Failed to start:', error.message);
        process.exit(1);
    }
}

startServer();
