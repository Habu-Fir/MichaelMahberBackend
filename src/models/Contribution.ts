import mongoose, { Schema, Document } from 'mongoose';

export interface IContribution extends Document {
  memberId: mongoose.Types.ObjectId;
  month: number;
  year: number;
  amount: number;
  status: 'pending' | 'paid';
  paidDate?: Date;
  receipt?: string;
  receiptFileName?: string;
  receiptMimeType?: string;
  uploadedBy?: mongoose.Types.ObjectId;
  verifiedBy?: mongoose.Types.ObjectId;
  verifiedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ContributionSchema = new Schema<IContribution>(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Member ID is required'],
      index: true
    },
    month: {
      type: Number,
      required: [true, 'Month is required'],
      min: 1,
      max: 12
    },
    year: {
      type: Number,
      required: [true, 'Year is required'],
      min: 2024
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: 0  // Changed from 1000 to 0 - allows any positive amount
    },
    status: {
      type: String,
      enum: ['pending', 'paid'],
      default: 'pending',
      index: true
    },
    paidDate: {
      type: Date
    },
    receipt: {
      type: String
    },
    receiptFileName: {
      type: String
    },
    receiptMimeType: {
      type: String
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    verifiedAt: {
      type: Date
    },
    notes: {
      type: String,
      maxlength: 500
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Compound index to prevent duplicate entries
ContributionSchema.index({ memberId: 1, month: 1, year: 1 }, { unique: true });

const Contribution = mongoose.model<IContribution>('Contribution', ContributionSchema);
export default Contribution;