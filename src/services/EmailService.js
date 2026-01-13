import nodemailer from 'nodemailer';
import process from 'process';

/**
 * Service for handling email communications
 * Uses Nodemailer with credentials from .env
 */
class EmailService {
    constructor() {
        this.transporter = null;
        this.init();
    }

    init() {
        // Only initialize if credentials exist
        if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
            this.transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });
            console.log('[EmailService] Transporter initialized for:', process.env.EMAIL_USER);
        } else {
            console.warn('[EmailService] Missing email credentials in .env');
        }
    }

    /**
     * Sends the partner's invite code to the user after detailed connection
     * @param {string} userEmail - Recipient email
     * @param {string} partnerInviteCode - The secret code to protect
     * @param {string} partnerName - Name of the partner (or 'Your Partner')
     */
    async sendPartnerConnectionEmail(userEmail, partnerInviteCode, partnerName) {
        if (!this.transporter) {
            console.warn('[EmailService] Cannot send email, transporter not ready.');
            return false;
        }

        const subject = `🔐 Guard This With Your Heart: ${partnerName}'s Connection Key`;

        // Stylish, "Divine" HTML template
        const html = `
            <div style="font-family: 'Georgia', serif; color: #1a1f2e; max-width: 600px; margin: 0 auto; padding: 40px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #fafbfc;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #6a4c93; font-style: italic; margin-bottom: 10px;">The Sacred Seal</h1>
                    <p style="text-transform: uppercase; letter-spacing: 2px; font-size: 12px; color: #888;">cuddle. Sanctuary</p>
                </div>
                
                <p style="font-size: 16px; line-height: 1.6;">Greetings, Beloved,</p>
                
                <p style="font-size: 16px; line-height: 1.6;">
                    You have successfully linked your soul's digital sanctuary with <strong>${partnerName}</strong>. 
                    As a steward of this bond, you are entrusted with the key to their presence.
                </p>

                <div style="background: linear-gradient(135deg, #fdfbfb 0%, #ebedee 100%); padding: 20px; border-radius: 8px; border: 1px solid #ddd; text-align: center; margin: 30px 0;">
                    <p style="margin: 0 0 10px 0; color: #555; font-size: 14px; font-style: italic;">Save this Sacred Key securely:</p>
                    <div style="font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #6a4c93; padding: 10px; border-bottom: 2px solid #6a4c93; display: inline-block;">
                        ${partnerInviteCode}
                    </div>
                </div>

                <p style="font-size: 16px; line-height: 1.6;">
                    This code is the bridge to your shared space. Should you ever need to reconnect or restore your sanctuary on a new device, you will need this key.
                </p>

                <p style="font-size: 16px; line-height: 1.6; margin-top: 30px; font-style: italic; color: #666;">
                    "Two are better than one, because they have a good return for their labor: If either of them falls down, one can help the other up."
                    <br>— Ecclesiastes 4:9-10
                </p>

                <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; font-size: 12px; color: #aaa;">
                    &copy; ${new Date().getFullYear()} cuddle. | Your Digital Sanctuary
                </div>
            </div>
        `;

        try {
            const info = await this.transporter.sendMail({
                from: `"cuddle. Sanctuary" <${process.env.EMAIL_USER}>`,
                to: userEmail,
                subject: subject,
                html: html
            });
            console.log('[EmailService] Email sent:', info.messageId);
            return true;
        } catch (error) {
            console.error('[EmailService] Failed to send email:', error);
            // We do NOT throw here, as email failure shouldn't break the connection flow
            return false;
        }
    }
}

export default new EmailService();
