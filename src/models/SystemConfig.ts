import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemConfig extends Document {
    totalContributions: number;
    totalInterest: number;
    totalAvailable: number;
    updatedAt: Date;
}

const SystemConfigSchema = new Schema<ISystemConfig>({
    totalContributions: {
        type: Number,
        required: true,
        default: 188021
    },
    totalInterest: {
        type: Number,
        default: 0
    },
    totalAvailable: {
        type: Number,
        default: 188021
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Auto-calculate total available before saving
SystemConfigSchema.pre('save', function(next) {
    this.totalAvailable = this.totalContributions + this.totalInterest;
    this.updatedAt = new Date();
    return;
});

const SystemConfig = mongoose.model<ISystemConfig>('SystemConfig', SystemConfigSchema);
export default SystemConfig;