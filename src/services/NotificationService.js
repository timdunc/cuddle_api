/**
 * Notification Service
 * Handles pushing messages to users
 */
import webpush from 'web-push';
import User from '../models/User.js';

// Initialize web-push
webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@cuddle.app',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

class NotificationService {
    /**
     * Send push notification to a user
     * @param {string} userId - Target user ID
     * @param {object} payload - Notification data { title, body, type }
     */
    async sendToUser(userId, payload) {
        try {
            const user = await User.findById(userId);
            if (!user || !user.pushSubscription || !user.pushSubscription.endpoint) {
                return false; // User not found or not subscribed
            }

            await webpush.sendNotification(
                user.pushSubscription,
                JSON.stringify(payload)
            );
            return true;
        } catch (error) {
            console.error('[Push] Send error:', error.message);
            if (error.statusCode === 410 || error.statusCode === 404) {
                // Subscription expired/invalid - remove it
                await User.findByIdAndUpdate(userId, { $unset: { pushSubscription: 1 } });
            }
            return false;
        }
    }
}

export default new NotificationService();
