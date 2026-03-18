import mongoose, { Schema, Document } from 'mongoose';

/**
 * =========================
 * 📄 Contribution Interface
 * =========================
 * Defines the structure of a contribution document
 */
export interface IContribution extends Document {
  memberId: mongoose.Types.ObjectId;  // Who paid
  month: number;                       // 1-12
  year: number;                        // 2024, 2025...
  amount: number;                      // 1000 ETB default
  status: 'pending' | 'paid' | 'late';
  paidDate?: Date;                      // When they actually paid
  receipt?: string;                     // URL to uploaded receipt
  receiptFileName?: string;              // Original filename
  receiptMimeType?: string;              // image/jpeg, application/pdf
  uploadedBy?: mongoose.Types.ObjectId;  // Member who uploaded
  verifiedBy?: mongoose.Types.ObjectId;  // Super Admin who verified
  verifiedAt?: Date;                      // When verified
  notes?: string;                          // Optional notes
  createdAt: Date;
  updatedAt: Date;
}

/**
 * =========================
 * 📄 Contribution Schema
 * =========================
 */
const ContributionSchema = new Schema<IContribution>(
  {
    memberId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Member ID is required'],
      index: true  // For faster queries
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
      min: 2024  // Starting year
    },

    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      default: 1000,  // Default contribution amount
      min: 0
    },

    status: {
      type: String,
      enum: ['pending', 'paid', 'late'],
      default: 'pending',
      index: true
    },

    paidDate: {
      type: Date
    },

    receipt: {
      type: String  // Path to uploaded file
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
    timestamps: true,  // Automatically adds createdAt and updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

/**
 * =========================
 * 🔍 Compound Index
 * =========================
 * Ensures one contribution per member per month/year
 * Prevents duplicate entries
 */
ContributionSchema.index({ memberId: 1, month: 1, year: 1 }, { unique: true });

/**
 * =========================
 * 🚀 Export Model
 * =========================
 */
const Contribution = mongoose.model<IContribution>('Contribution', ContributionSchema);

export default Contribution;