import Groq from 'groq-sdk';
import process from 'process';
import AiUsage from '../models/AiUsage.js';

// Configuration
const DAILY_REQUEST_LIMIT = 3; // 3 thoughtful questions per day
const MODEL_NAME = 'llama-3.3-70b-versatile'; // High capability model

class GroqService {
    constructor() {
        this.client = null;
        this.init();
    }

    init() {
        if (process.env.GROQ_API_KEY) {
            this.client = new Groq({ apiKey: process.env.GROQ_API_KEY });
            console.log('[GroqService] Client initialized');
        } else {
            console.warn('[GroqService] Missing GROQ_API_KEY in .env');
        }
    }

    /**
     * Get tailored System Prompt based on context
     */
    getSystemPrompt(context) {
        const { gender, partnerName, partnerGender } = context;

        // Base Persona: The Divine Counsel
        let prompt = `You are "The Divine Counsel", a transcendent guide embedded within the "cuddle." app.
Your purpose is to steward generic human growth into Divine Maturity.
You MUST analyze every query through these 5 Dimensions of Wisdom:

1. 🏛️ PHILOSOPHICAL (The "Why"): Existential purpose, ethics, stoicism, and checking the user's reasoning.
2. 🧠 PSYCHOLOGICAL (The "Mind"): Emotional intelligence, attachment styles, conflict resolution, and mental models.
3. 💼 PROFESSIONAL (The "Steward"): Financial wisdom, career maturity, leadership, responsibility, and provision.
4. ⚡ NEUROLOGICAL (The "Body"): Dopamine regulation, habit formation, brain health, sleep, and biological drives.
5. ✝️ RELIGIOUS (The "Spirit"): KJV Biblical truth, covenant alignment, prayer, and spiritual warfare.

INSTRUCTIONS:
- You are NOT a simple chatbot. You are a Council of Wisdom.
- Synthesize your answer by weaving these 5 threads together.
- ALWAYS cite specific KJV references (Book Chapter:Verse) to anchor the "Religious" dimension.
- Use a tone that is Ancient yet Modern, Authoritative yet Loving.
- If the user is Male, challenge him to Headship and Strength.
- If the user is Female, encourage her in Nurturing and Wisdom.

CRITICAL:
Your goal is not just to answer, but to TRANSFORM the user's thinking.`;

        // Gender Optimization (Biblical Archetypes)
        if (gender === 'male') {
            prompt += `
\nCONTEXT: You are speaking to a MAN (Husband/Partner).
Focus on: Servant Leadership, Protection, Provision, Strength, Sacrifice, and Understanding his wife/partner.
Encourage him to be the "Head" who serves, listens, and covers his partner in prayer.
Call him to rise above passivity and take spiritual initiative.`;
        } else if (gender === 'female') {
            prompt += `
\nCONTEXT: You are speaking to a WOMAN (Wife/Partner).
Focus on: Nurturing, Wisdom, Grace, Inner Beauty, and Supporting her husband/partner.
Encourage her to be a "Helper suitable" (Ezer Kenegdo) - a strong warrior-ally who compliments him.
Help her process emotions through faith and build a peaceful sanctuary in the relationship.`;
        }

        // Shared Context
        if (partnerName) {
            prompt += `\nPartner's Name: ${partnerName}. Always refer to the relationship as a sacred covenant to be guarded.`;
        }

        return prompt;
    }

    /**
     * Track usage and enforce limits
     */
    async trackUsage(userId, tokens) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const usage = await AiUsage.findOneAndUpdate(
            { userId, date: today },
            {
                $inc: {
                    tokensUsed: tokens.total,
                    requestCount: 1,
                    'breakdown.promptTokens': tokens.prompt,
                    'breakdown.completionTokens': tokens.completion
                }
            },
            { upsert: true, new: true }
        );

        return usage;
    }

    /**
     * Main Chat Completion Method
     */
    async chatCompletion(userId, messages, context = {}) {
        if (!this.client) throw new Error('AI Service not configured');

        // 1. Check Usage Limits
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const currentUsage = await AiUsage.findOne({ userId, date: today });

        if (currentUsage && currentUsage.requestCount >= DAILY_REQUEST_LIMIT) {
            throw new Error('Daily Questions limit reached (3/3). Reflect on the wisdom shared today.');
        }

        // 2. Prepare Messages
        const systemPrompt = this.getSystemPrompt(context);
        const fullMessages = [
            { role: 'system', content: systemPrompt },
            ...messages
        ];

        try {
            // 3. Call Groq API
            const completion = await this.client.chat.completions.create({
                messages: fullMessages,
                model: MODEL_NAME,
                temperature: 0.7,
                max_tokens: 1024,
            });

            const reply = completion.choices[0]?.message?.content || "";
            const usageStats = completion.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 };

            // 4. Record Usage
            const updatedUsage = await this.trackUsage(userId, {
                total: usageStats.total_tokens,
                prompt: usageStats.prompt_tokens,
                completion: usageStats.completion_tokens
            });

            return {
                reply,
                usage: {
                    used: updatedUsage.requestCount,
                    limit: DAILY_REQUEST_LIMIT,
                    remaining: Math.max(0, DAILY_REQUEST_LIMIT - updatedUsage.requestCount)
                }
            };

        } catch (error) {
            console.error('[GroqService] Error:', error);
            throw error;
        }
    }

    /**
     * Get Usage Stats for a User
     */
    async getUsage(userId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const usage = await AiUsage.findOne({ userId, date: today });
        const used = usage ? usage.requestCount : 0;

        return {
            used,
            limit: DAILY_REQUEST_LIMIT,
            remaining: Math.max(0, DAILY_REQUEST_LIMIT - used)
        };
    }
}

export default new GroqService();
