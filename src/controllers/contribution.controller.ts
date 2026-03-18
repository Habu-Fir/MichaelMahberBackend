import { Request, Response, NextFunction } from 'express';
import Contribution from '../models/Contribution';
import User from '../models/User';
import asyncHandler from '../utils/asyncHandler';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../middleware/auth';
import path from 'path';
import fs from 'fs';

/**
 * =========================
 * 📅 Generate Monthly Contributions
 * =========================
 * @route   POST /api/contributions/generate
 * @access  Private/Admin/SuperAdmin
 * 
 * Creates a "pending" contribution for every active member
 * Run this on the 1st of each month
 */
export const generateMonthlyContributions = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const { month, year } = req.body;

    // Validate month/year
    if (!month || !year) {
        return next(new ErrorResponse('Please provide month and year', 400));
    }

    // Check if contributions already exist for this month
    const existing = await Contribution.findOne({ month, year });
    if (existing) {
        return next(new ErrorResponse(`Contributions for ${month}/${year} already exist`, 400));
    }

    // Get all active members
    const members = await User.find({
        isActive: true,
        role: { $in: ['member', 'approver', 'admin', 'super_admin'] }
    });

    if (members.length === 0) {
        return next(new ErrorResponse('No active members found', 404));
    }

    // Create contribution for each member
    const contributions = await Promise.all(
        members.map(member =>
            Contribution.create({
                memberId: member._id,
                month,
                year,
                amount: 1000, // Fixed amount
                status: 'pending'
            })
        )
    );

    res.status(201).json({
        success: true,
        message: `Generated ${contributions.length} contributions for ${month}/${year}`,
        data: {
            count: contributions.length,
            month,
            year
        }
    });
});

/**
 * =========================
 * 📤 Upload Receipt
 * =========================
 * @route   POST /api/contributions/:id/receipt
 * @access  Private (Member who owns it)
 * 
 * Member uploads proof of payment
 */
export const uploadReceipt = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const { id } = req.params;

    // Check if file was uploaded
    if (!req.file) {
        return next(new ErrorResponse('Please upload a receipt file', 400));
    }

    // Find the contribution
    const contribution = await Contribution.findById(id);
    if (!contribution) {
        return next(new ErrorResponse('Contribution not found', 404));
    }

    // Verify this member owns this contribution
    if (contribution.memberId.toString() !== req.user?._id.toString()) {
        return next(new ErrorResponse('Not authorized to upload for this contribution', 403));
    }

    // Check if already paid
    if (contribution.status === 'paid') {
        return next(new ErrorResponse('This contribution is already paid', 400));
    }

    // Update contribution with receipt info
    contribution.receipt = req.file.path;
    contribution.receiptFileName = req.file.originalname;
    contribution.receiptMimeType = req.file.mimetype;
    contribution.uploadedBy = req.user._id;
    contribution.status = 'pending'; // Still pending until verified

    await contribution.save();

    res.status(200).json({
        success: true,
        message: 'Receipt uploaded successfully. Awaiting verification.',
        data: {
            id: contribution._id,
            status: contribution.status,
            receipt: contribution.receipt
        }
    });
});

/**
 * =========================
 * ✅ Verify Contribution
 * =========================
 * @route   PUT /api/contributions/:id/verify
 * @access  Private/SuperAdmin ONLY
 * 
 * Super Admin verifies payment and marks as paid
 */
export const verifyContribution = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const { id } = req.params;
    const { notes } = req.body;

    const contribution = await Contribution.findById(id);
    if (!contribution) {
        return next(new ErrorResponse('Contribution not found', 404));
    }

    // Check if already paid
    if (contribution.status === 'paid') {
        return next(new ErrorResponse('This contribution is already verified', 400));
    }

    // Check if receipt exists
    if (!contribution.receipt) {
        return next(new ErrorResponse('No receipt uploaded yet', 400));
    }

    // Update status to paid
    contribution.status = 'paid';
    contribution.paidDate = new Date();
    contribution.verifiedBy = req.user?._id;
    contribution.verifiedAt = new Date();
    contribution.notes = notes || contribution.notes;

    await contribution.save();

    res.status(200).json({
        success: true,
        message: 'Contribution verified and marked as paid',
        data: contribution
    });
});

/**
 * =========================
 * 📋 Get All Contributions
 * =========================
 * @route   GET /api/contributions
 * @access  Private/Admin/SuperAdmin
 * 
 * Get all contributions with filters
 */
export const getContributions = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const { month, year, status, page = 1, limit = 20 } = req.query;

    // Build filter
    const filter: any = {};
    if (month) filter.month = parseInt(month as string);
    if (year) filter.year = parseInt(year as string);
    if (status) filter.status = status;

    // Pagination
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [contributions, total] = await Promise.all([
        Contribution.find(filter)
            .populate('memberId', 'name email')
            .populate('verifiedBy', 'name')
            .skip(skip)
            .limit(parseInt(limit as string))
            .sort('-year -month'),
        Contribution.countDocuments(filter)
    ]);

    res.status(200).json({
        success: true,
        count: contributions.length,
        total,
        page: parseInt(page as string),
        pages: Math.ceil(total / parseInt(limit as string)),
        data: contributions
    });
});

/**
 * =========================
 * 👤 Get My Contributions
 * =========================
 * @route   GET /api/contributions/my
 * @access  Private
 * 
 * Get current user's contribution history
 */
export const getMyContributions = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const contributions = await Contribution.find({ memberId: req.user?._id })
        .sort('-year -month');

    // Calculate statistics
    const stats = {
        totalPaid: contributions
            .filter(c => c.status === 'paid')
            .reduce((sum, c) => sum + c.amount, 0),
        totalPending: contributions
            .filter(c => c.status === 'pending')
            .reduce((sum, c) => sum + c.amount, 0),
        paidCount: contributions.filter(c => c.status === 'paid').length,
        pendingCount: contributions.filter(c => c.status === 'pending').length,
        lastPaid: contributions.find(c => c.status === 'paid')?.paidDate || null
    };

    res.status(200).json({
        success: true,
        data: {
            contributions,
            stats
        }
    });
});

/**
 * =========================
 * 📊 Get Contribution Summary
 * =========================
 * @route   GET /api/contributions/summary
 * @access  Private/Admin/SuperAdmin
 * 
 * Get summary statistics for dashboard
 */
export const getContributionSummary = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const { year } = req.query;
    const targetYear = parseInt(year as string) || new Date().getFullYear();

    // Total collected this year
    const yearlyTotal = await Contribution.aggregate([
        {
            $match: {
                year: targetYear,
                status: 'paid'
            }
        },
        {
            $group: {
                _id: null,
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        }
    ]);

    // Monthly breakdown
    const monthlyBreakdown = await Contribution.aggregate([
        {
            $match: {
                year: targetYear,
                status: 'paid'
            }
        },
        {
            $group: {
                _id: '$month',
                total: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    // Pending verifications
    const pendingVerifications = await Contribution.countDocuments({
        status: 'pending',
        receipt: { $ne: null }
    });

    res.status(200).json({
        success: true,
        data: {
            year: targetYear,
            totalCollected: yearlyTotal[0]?.total || 0,
            totalPayments: yearlyTotal[0]?.count || 0,
            monthlyBreakdown,
            pendingVerifications
        }
    });
});