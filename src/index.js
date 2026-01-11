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
import webrtcRoutes from './routes/webrtcRoutes.js';

// Load environment variables
dotenv.config();

// Socket.IO Setup
import { createServer } from 'http';
import { Server } from 'socket.io';
import User from './models/User.js';

const app = express();
const httpServer = createServer(app);

// Trust proxy for Render/Heroku/etc (required for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

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
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://cuddle-new.netlify.app',
    process.env.CLIENT_URL
].filter(Boolean);

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('localhost') || origin.includes('netlify.app')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
};

app.use(cors(corsOptions));

// Socket.IO Initialization
const io = new Server(httpServer, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Expose io to routes
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Socket Logic
io.on('connection', (socket) => {
    // console.log('[Socket] Client connected:', socket.id);

    // Register User
    socket.on('register', async (userId) => {
        try {
            socket.userId = userId; // Store for disconnect
            if (!userId) return;

            // Update DB
            await User.findByIdAndUpdate(userId, {
                isOnline: true,
                lastActiveAt: new Date()
            });

            // Find partner and notify
            const user = await User.findById(userId).select('partnerId');
            if (user?.partnerId) {
                // 1. Notify Partner that I am online
                io.to(user.partnerId.toString()).emit('partner-status', {
                    userId: userId,
                    isOnline: true
                });

                // 2. Tell ME if partner is online
                const partner = await User.findById(user.partnerId).select('isOnline');
                if (partner) {
                    socket.emit('partner-status', {
                        userId: user.partnerId,
                        isOnline: partner.isOnline || false
                    });
                }
            }
        } catch (e) {
            console.error('[Socket] Register error:', e);
        }
    });

    // Heartbeat to keep user marked as online (Enhanced with visibility/focus data)
    socket.on('heartbeat', async (data) => {
        // Support both old format (just userId string) and new format (object with details)
        const userId = typeof data === 'string' ? data : data?.userId;
        if (!userId) return;

        try {
            const updateData = {
                isOnline: true,
                lastActiveAt: new Date()
            };

            // If enhanced data is provided, store visibility state
            if (typeof data === 'object') {
                updateData.isVisible = data.isVisible ?? true;
                updateData.isFocused = data.isFocused ?? true;
            }

            await User.findByIdAndUpdate(userId, updateData);
        } catch (e) {
            // silent fail
        }
    });

    // Visibility change event (when user switches tabs or minimizes)
    socket.on('visibility', async (data) => {
        if (!data?.userId) return;
        try {
            await User.findByIdAndUpdate(data.userId, {
                isVisible: data.visible,
                lastActiveAt: new Date()
            });
        } catch (e) { /* silent */ }
    });

    // Focus change event (when window gains/loses focus)
    socket.on('focus', async (data) => {
        if (!data?.userId) return;
        try {
            await User.findByIdAndUpdate(data.userId, {
                isFocused: data.focused,
                lastActiveAt: new Date()
            });
        } catch (e) { /* silent */ }
    });

    // Activity event (user interaction detected)
    socket.on('activity', async (data) => {
        if (!data?.userId) return;
        try {
            await User.findByIdAndUpdate(data.userId, {
                isOnline: true,
                lastActiveAt: new Date(data.timestamp || Date.now())
            });
        } catch (e) { /* silent */ }
    });

    // Away status event
    socket.on('away', async (userId) => {
        if (!userId) return;
        try {
            await User.findByIdAndUpdate(userId, {
                status: 'away',
                lastActiveAt: new Date()
            });

            // Notify partner of away status
            const user = await User.findById(userId).select('partnerId');
            if (user?.partnerId) {
                io.to(user.partnerId.toString()).emit('partner-status', {
                    userId: userId,
                    isOnline: true,
                    status: 'away'
                });
            }
        } catch (e) { /* silent */ }
    });

    socket.on('disconnect', async () => {
        // console.log('[Socket] Client disconnected:', socket.id);
        if (socket.userId) {
            try {
                await User.findByIdAndUpdate(socket.userId, {
                    isOnline: false,
                    lastActiveAt: new Date()
                });

                const user = await User.findById(socket.userId).select('partnerId');
                if (user?.partnerId) {
                    io.to(user.partnerId.toString()).emit('partner-status', {
                        userId: socket.userId,
                        isOnline: false
                    });
                }
            } catch (e) {
                console.error('[Socket] Disconnect error:', e);
            }
        }
    });
});

// Rate limiting - generous limits for partner communication
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10000, // Allow many requests for real-time messaging
    message: { error: 'Too many requests, please try again later.' },
});
app.use('/api', limiter); // Apply rate limiting to all /api routes

// Body parsing (for encrypted blobs)
app.use(express.json({ limit: '50mb' })); // Increased for audio/image blobs

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
app.use('/api/webrtc', webrtcRoutes);

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

        // Start server (Using httpServer instead of app)
        httpServer.listen(PORT, () => {
            console.log(`[Server] cuddle. backend running on port ${PORT}`);
            console.log(`[Server] Environment: ${process.env.NODE_ENV}`);
            console.log('[Server] Zero-knowledge encryption - backend sees only ciphertext');
            console.log('[Server] Socket.IO initialized');
        });
    } catch (error) {
        console.error('[Server] Failed to start:', error.message);
        process.exit(1);
    }
}

startServer();
