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
        approvedBy?: mongoose.Types.ObjectId;  // Add this
        approvedAt?: Date;                      // Add this
    }>;
    pendingPayments?: Array<any>;
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
            paymentMethod: { type: String, required: true },
            receiptUrl: String,
            notes: String,
            approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },  // Add this
            approvedAt: Date                                             // Add this
        }],
        pendingPayments: [{
            amount: Number,
            paymentMethod: String,
            receiptUrl: String,
            requestedAt: { type: Date, default: Date.now },
            status: { type: String, default: 'pending' }
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

const Loan = mongoose.model<ILoan>('Loan', LoanSchema);
export default Loan;