import express from 'express';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';
import { auth } from '../middleware/auth.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Cloudinary Config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'cuddle-avatars',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
        transformation: [{ width: 500, height: 500, crop: 'limit' }]
    },
});

const upload = multer({ storage: storage });

/**
 * POST /api/upload/avatar
 * Uploads an avatar to Cloudinary and returns the URL.
 * Client should then call PATCH /api/auth/me to save this URL.
 */
router.post('/avatar', auth, upload.single('image'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // req.file.path contains the Cloudinary URL
    res.json({ url: req.file.path });
});

export default router;
