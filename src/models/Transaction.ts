import mongoose, { Schema, Document } from 'mongoose';

export interface ITransaction extends Document {
    // Order identification
    orderId: string;

    // Loan information
    loanId: mongoose.Types.ObjectId;
    loanNumber: string;

    // Member information
    memberId: mongoose.Types.ObjectId;
    memberName?: string;
    phoneNumber: string;

    // Payment details
    amount: number;
    paymentMethod: 'dashen_ussd';

    // Dashen API data
    sessionId: string;
    ftNumber?: string;
    billRefNumber?: string;

    // Status tracking
    status: 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled';
    statusMessage?: string;

    // Callback data
    callbackData?: any;
    callbackReceived: boolean;
    callbackAttempts: number;
    lastCallbackAt?: Date;

    // Timestamps
    initiatedAt: Date;
    completedAt?: Date;

    // Metadata
    metadata?: Map<string, any>;

    createdAt: Date;
    updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
    {
        orderId: {
            type: String,
            required: true,
            unique: true,
            index: true,
            trim: true
        },
        loanId: {
            type: Schema.Types.ObjectId,
            ref: 'Loan',
            required: true,
            index: true
        },
        loanNumber: {
            type: String,
            required: true,
            index: true
        },
        memberId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        memberName: {
            type: String,
            required: true
        },
        phoneNumber: {
            type: String,
            required: true,
            index: true,
            validate: {
                validator: function (v: string) {
                    return /^\+251[0-9]{9}$/.test(v);
                },
                message: 'Phone number must be in format +2519XXXXXXXX'
            }
        },
        amount: {
            type: Number,
            required: true,
            min: 0.01
        },
        paymentMethod: {
            type: String,
            enum: ['dashen_ussd'],
            default: 'dashen_ussd',
            required: true
        },
        sessionId: {
            type: String,
            required: true
        },
        ftNumber: {
            type: String,
            sparse: true,
            index: true
        },
        billRefNumber: {
            type: String,
            sparse: true
        },
        status: {
            type: String,
            enum: ['pending', 'processing', 'paid', 'failed', 'cancelled'],
            default: 'pending',
            index: true
        },
        statusMessage: {
            type: String,
            default: ''
        },
        callbackData: {
            type: Schema.Types.Mixed,
            default: null
        },
        callbackReceived: {
            type: Boolean,
            default: false
        },
        callbackAttempts: {
            type: Number,
            default: 0
        },
        lastCallbackAt: {
            type: Date
        },
        initiatedAt: {
            type: Date,
            default: Date.now
        },
        completedAt: {
            type: Date
        },
        metadata: {
            type: Map,
            of: Schema.Types.Mixed,
            default: {}
        }
    },
    {
        timestamps: true
    }
);

// Compound indexes for common queries
TransactionSchema.index({ memberId: 1, status: 1, createdAt: -1 });
TransactionSchema.index({ loanId: 1, status: 1 });
TransactionSchema.index({ phoneNumber: 1, createdAt: -1 });
TransactionSchema.index({ status: 1, createdAt: -1 });

// Virtual for transaction age
TransactionSchema.virtual('age').get(function (this: ITransaction) {
    return Math.floor((Date.now() - this.initiatedAt.getTime()) / 1000 / 60);
});

// Methods
TransactionSchema.methods.markAsPaid = async function (ftNumber: string, callbackData: any) {
    this.status = 'paid';
    this.ftNumber = ftNumber;
    this.callbackData = callbackData;
    this.callbackReceived = true;
    this.completedAt = new Date();
    this.statusMessage = 'Payment successful';
    await this.save();
};

TransactionSchema.methods.markAsFailed = async function (reason: string, callbackData?: any) {
    this.status = 'failed';
    this.callbackData = callbackData;
    this.callbackReceived = true;
    this.completedAt = new Date();
    this.statusMessage = reason;
    await this.save();
};

TransactionSchema.methods.markAsCancelled = async function (reason: string) {
    this.status = 'cancelled';
    this.completedAt = new Date();
    this.statusMessage = reason;
    await this.save();
};

TransactionSchema.methods.recordCallbackAttempt = async function () {
    this.callbackAttempts += 1;
    this.lastCallbackAt = new Date();
    await this.save();
};

// Static methods
TransactionSchema.statics.findByOrderId = function (orderId: string) {
    return this.findOne({ orderId });
};

TransactionSchema.statics.findByLoanId = function (loanId: string) {
    return this.find({ loanId }).sort({ createdAt: -1 });
};

TransactionSchema.statics.findPendingPayments = function () {
    return this.find({
        status: { $in: ['pending', 'processing'] },
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
    });
};

TransactionSchema.statics.findFailedPayments = function () {
    return this.find({
        status: 'failed',
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
    });
};

// Pre-save middleware
TransactionSchema.pre('save', function (next) {
    // Generate billRefNumber if not present
    if (!this.billRefNumber && this.orderId) {
        this.billRefNumber = this.orderId;
    }
    return;
});

export const Transaction = mongoose.model<ITransaction>('Transaction', TransactionSchema);