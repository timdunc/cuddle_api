import mongoose from 'mongoose';

/**
 * AiUsage Model
 * Tracks token consumption for the "Divine Counsel" (Groq AI)
 * Used to enforce daily limits and monitor usage patterns.
 */
const aiUsageSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    // Normalized date (midnight) for daily tracking
    date: {
        type: Date,
        required: true,
        index: true
    },
    // Total tokens consumed (Prompt + Completion)
    tokensUsed: {
        type: Number,
        default: 0
    },
    // Number of requests made
    requestCount: {
        type: Number,
        default: 0
    },
    // Detailed breakdown (optional, for auditing high usage)
    breakdown: {
        promptTokens: { type: Number, default: 0 },
        completionTokens: { type: Number, default: 0 }
    }
});

// Compound index for efficient daily lookups per user
aiUsageSchema.index({ userId: 1, date: 1 }, { unique: true });

const AiUsage = mongoose.model('AiUsage', aiUsageSchema);
export default AiUsage;
