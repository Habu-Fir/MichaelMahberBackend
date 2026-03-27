import mongoose, { Schema, Document } from 'mongoose';

export interface ILoan extends Document {
    loanNumber: string;
    memberId: mongoose.Types.ObjectId;
    memberName?: string;
    principal: number;
    interestRate: number;
    totalPayable: number;
    amountPaid: number;
    remainingPrincipal: number;
    interestAccrued: number;
    interestPaid: number;
    lastInterestCalculation: Date;
    status: string;
    requestDate: Date;
    approvalDate?: Date;
    disbursementDate?: Date;
    completedDate?: Date;
    requiredSignatures: number;
    signatures: Array<any>;
    purpose: string;
    notes?: string;
    disbursementReceiptUrl?: string;
    paymentHistory: Array<{
        amount: number;
        principalPortion: number;
        interestPortion: number;
        date: Date;
        paymentMethod: string;
        receiptUrl?: string;
        notes?: string;
        approvedBy?: mongoose.Types.ObjectId;
        approvedAt?: Date;
    }>;
    pendingPayments: Array<{  // 🆕 Changed from optional to required with full type
        amount: number;
        paymentMethod: string;
        receiptUrl?: string;
        notes?: string;
        requestedAt: Date;
        status: 'pending' | 'approved' | 'rejected';
        reviewedAt?: Date;      // 🆕 NEW - When payment was reviewed
        reviewNotes?: string;    // 🆕 NEW - Review notes/feedback
        // 🆕 NEW - Dashen USSD specific fields
        dashenOrderId?: string;   // Order ID from Dashen
        phoneNumber?: string;     // Customer's phone number
        transactionId?: string;   // Dashen transaction reference
    }>;
    createdBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const LoanSchema = new Schema<ILoan>(
    {
        loanNumber: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },
        memberId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        memberName: {
            type: String,
            required: true,
            trim: true
        },
        principal: {
            type: Number,
            required: true,
            min: 100
        },
        interestRate: {
            type: Number,
            required: true,
            default: 3
        },
        totalPayable: {
            type: Number,
            default: 0
        },
        amountPaid: {
            type: Number,
            default: 0
        },
        remainingPrincipal: {
            type: Number,
            required: true
        },
        interestAccrued: {
            type: Number,
            default: 0
        },
        interestPaid: {
            type: Number,
            default: 0
        },
        lastInterestCalculation: {
            type: Date,
            default: Date.now
        },
        status: {
            type: String,
            enum: ['pending', 'ready_for_approval', 'approved', 'active', 'payment_pending', 'completed', 'rejected'],
            default: 'pending'
        },
        requestDate: {
            type: Date,
            default: Date.now
        },
        approvalDate: Date,
        disbursementDate: Date,
        completedDate: Date,
        requiredSignatures: {
            type: Number,
            required: true
        },
        signatures: [{
            memberId: { type: Schema.Types.ObjectId, ref: 'User' },
            signedAt: { type: Date, default: Date.now },
            memberName: String
        }],
        purpose: {
            type: String,
            required: true,
            enum: ['business', 'education', 'medical', 'home', 'debt', 'other']
        },
        notes: String,
        disbursementReceiptUrl: String,
        paymentHistory: [{
            amount: { type: Number, required: true },
            principalPortion: { type: Number, required: true, default: 0 },
            interestPortion: { type: Number, required: true, default: 0 },
            date: { type: Date, default: Date.now },
            paymentMethod: {
                type: String,
                required: true,
                enum: ['cash', 'bank', 'mobile', 'dashen_ussd', 'other']  // 🆕 Added 'dashen_ussd'
            },
            receiptUrl: String,
            notes: String,
            approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
            approvedAt: Date
        }],
        pendingPayments: [{
            amount: { type: Number, required: true },
            paymentMethod: {
                type: String,
                required: true,
                enum: ['cash', 'bank', 'mobile', 'dashen_ussd', 'other'],  // 🆕 Added 'dashen_ussd'
                default: 'cash'
            },
            receiptUrl: String,
            notes: String,
            requestedAt: { type: Date, default: Date.now },
            status: {
                type: String,
                enum: ['pending', 'approved', 'rejected'],  // 🆕 Updated enum
                default: 'pending'
            },
            // 🆕 NEW FIELDS START HERE
            reviewedAt: { type: Date },           // When admin reviews the payment
            reviewNotes: { type: String },        // Admin review notes
            dashenOrderId: {                      // Dashen order ID from payment initiation
                type: String,
                sparse: true,
                index: true
            },
            phoneNumber: {                         // Customer's Dashen phone number
                type: String,
                sparse: true,
                validate: {
                    validator: function (v: string) {
                        return !v || /^\+251[0-9]{9}$/.test(v);
                    },
                    message: 'Phone number must be in format +2519XXXXXXXX'
                }
            },
            transactionId: {                       // Dashen transaction reference (ftNumber)
                type: String,
                sparse: true,
                index: true
            }
            // 🆕 NEW FIELDS END HERE
        }],
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    {
        timestamps: true
    }
);

// 🆕 NEW: Add indexes for Dashen payment queries
LoanSchema.index({ 'pendingPayments.dashenOrderId': 1 });
LoanSchema.index({ 'pendingPayments.status': 1, 'pendingPayments.requestedAt': -1 });
LoanSchema.index({ status: 1, 'pendingPayments.status': 1 });

const Loan = mongoose.model<ILoan>('Loan', LoanSchema);
export default Loan;