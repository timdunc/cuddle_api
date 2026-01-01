/**
 * Auth Middleware - JWT verification for protected routes
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

/**
 * Verify JWT token from x-auth-token header
 */
export const auth = (req, res, next) => {
    const token = req.header('x-auth-token');

    if (!token) {
        return res.status(401).json({ error: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded.user;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Token is not valid' });
    }
};

/**
 * Generate JWT token
 */
export const generateToken = (userId) => {
    const payload = {
        user: {
            id: userId,
        },
    };

    return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
};

export default { auth, generateToken };
