import { Request, Response, NextFunction } from 'express';
import Loan from '../models/Loan';
import User from '../models/User';
import Contribution from '../models/Contribution';
import asyncHandler from '../utils/asyncHandler';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../middleware/auth';

// ==================== SUPER ADMIN DASHBOARD ====================

export const getSuperAdminDashboard = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    console.log('\n📊 ===== SUPER ADMIN DASHBOARD =====');

    // ===== 1. MEMBER STATISTICS =====
    const totalMembers = await User.countDocuments({
        isActive: true,
        role: { $in: ['member', 'approver', 'admin', 'super_admin'] }
    });

    const membersByRole = await User.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$role', count: { $sum: 1 } } }
    ]);

    // ===== 2. LOAN STATISTICS =====
    const loanStats = await Loan.aggregate([
        {
            $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalPrincipal: { $sum: '$principal' },
                totalPaid: { $sum: '$amountPaid' },
                totalInterest: { $sum: '$interestPaid' }
            }
        }
    ]);

    const activeLoans = await Loan.find({ status: 'active' });

    // Calculate total outstanding (principal + unpaid interest)
    let totalOutstanding = 0;
    let totalUnpaidInterest = 0;

    activeLoans.forEach(loan => {
        const unpaidInterest = loan.interestAccrued - loan.interestPaid;
        totalOutstanding += loan.remainingPrincipal + unpaidInterest;
        totalUnpaidInterest += unpaidInterest;
    });

    // ===== 3. PENDING PAYMENTS =====
    const pendingPaymentsLoans = await Loan.find({
        status: 'payment_pending',
        'pendingPayments.status': 'pending'
    }).select('loanNumber memberName pendingPayments');

    const pendingPayments = pendingPaymentsLoans.flatMap(loan =>
        loan.pendingPayments
            ?.filter(p => p.status === 'pending')
            .map(p => ({
                loanId: loan._id,
                loanNumber: loan.loanNumber,
                memberName: loan.memberName,
                amount: p.amount,
                requestedAt: p.requestedAt,
                paymentMethod: p.paymentMethod,
                receiptUrl: p.receiptUrl
            })) || []
    );

    // ===== 4. CONTRIBUTION STATISTICS =====
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    const contributionStats = await Contribution.aggregate([
        {
            $match: {
                year: currentYear,
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

    const totalCollected = await Contribution.aggregate([
        { $match: { status: 'paid' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // ===== 5. RECENT ACTIVITY =====
    const recentLoans = await Loan.find()
        .sort('-createdAt')
        .limit(5)
        .select('loanNumber memberName principal status createdAt');

    const recentPayments = await Loan.find({ 'paymentHistory.0': { $exists: true } })
        .sort('-paymentHistory.date')
        .limit(5)
        .select('loanNumber memberName paymentHistory');

    // Format recent activity
    const recentActivity = [
        ...recentLoans.map(loan => ({
            type: 'loan_request',
            description: `${loan.memberName} requested a loan of ${loan.principal} ETB`,
            loanNumber: loan.loanNumber,
            status: loan.status,
            date: loan.createdAt
        })),
        ...recentPayments.map(loan => {
            const lastPayment = loan.paymentHistory[loan.paymentHistory.length - 1];
            return {
                type: 'payment',
                description: `${loan.memberName} made a payment of ${lastPayment.amount} ETB`,
                loanNumber: loan.loanNumber,
                amount: lastPayment.amount,
                date: lastPayment.date
            };
        })
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 10);

    // ===== 6. FINANCIAL SUMMARY =====
    const totalPool = totalCollected[0]?.total || 0;
    const totalLoansDisbursed = loanStats.find(s => s._id === 'active')?.totalPrincipal || 0;
    const totalPrincipalRepaid = loanStats.reduce((sum, s) => sum + (s.totalPaid || 0), 0);
    const totalInterestEarned = loanStats.reduce((sum, s) => sum + (s.totalInterest || 0), 0);

    const availableCapital = totalPool - totalLoansDisbursed + totalPrincipalRepaid;

    res.status(200).json({
        success: true,
        data: {
            members: {
                total: totalMembers,
                byRole: membersByRole
            },
            loans: {
                byStatus: loanStats,
                activeCount: activeLoans.length,
                totalOutstanding,
                totalUnpaidInterest,
                pendingPaymentsCount: pendingPayments.length
            },
            contributions: {
                currentYear,
                currentMonth,
                monthlyStats: contributionStats,
                totalCollected: totalPool
            },
            finances: {
                totalPool,
                totalLoansDisbursed,
                totalPrincipalRepaid,
                totalInterestEarned,
                availableCapital
            },
            pendingPayments: pendingPayments.slice(0, 10), // Latest 10
            recentActivity
        }
    });
});

// ==================== APPROVER DASHBOARD ====================

export const getApproverDashboard = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    // Loans ready for approval (50% signatures reached)
    const readyForApproval = await Loan.find({
        status: 'ready_for_approval'
    })
        .populate('memberId', 'name')
        .select('loanNumber memberName principal requiredSignatures signatures requestDate');

    // Format with signature progress
    const formatted = readyForApproval.map(loan => ({
        _id: loan._id,
        loanNumber: loan.loanNumber,
        memberName: loan.memberName,
        principal: loan.principal,
        requestDate: loan.requestDate,
        signatures: loan.signatures.length,
        requiredSignatures: loan.requiredSignatures,
        progress: Math.round((loan.signatures.length / loan.requiredSignatures) * 100)
    }));

    res.status(200).json({
        success: true,
        data: {
            readyForApproval: formatted,
            count: formatted.length
        }
    });
});

// ==================== MEMBER DASHBOARD ====================

export const getMemberDashboard = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const memberId = req.user?._id;

    // Get member's loans
    const loans = await Loan.find({ memberId }).sort('-requestDate');

    // Calculate current totals with interest
    let totalOutstanding = 0;
    let totalUnpaidInterest = 0;
    const activeLoans = [];

    for (const loan of loans) {
        if (loan.status === 'active') {
            const unpaidInterest = loan.interestAccrued - loan.interestPaid;
            const currentTotal = loan.remainingPrincipal + unpaidInterest;

            totalOutstanding += currentTotal;
            totalUnpaidInterest += unpaidInterest;

            activeLoans.push({
                loanNumber: loan.loanNumber,
                principal: loan.principal,
                remainingPrincipal: loan.remainingPrincipal,
                unpaidInterest,
                currentTotal,
                interestRate: loan.interestRate,
                lastPayment: loan.paymentHistory[loan.paymentHistory.length - 1]
            });
        }
    }

    // Get member's contributions
    const contributions = await Contribution.find({ memberId })
        .sort('-year -month')
        .limit(12);

    const pendingPayments = loans.filter(l =>
        l.pendingPayments?.some(p => p.status === 'pending')
    ).length;

    res.status(200).json({
        success: true,
        data: {
            loans: {
                total: loans.length,
                active: activeLoans.length,
                completed: loans.filter(l => l.status === 'completed').length,
                pending: loans.filter(l => l.status === 'pending').length,
                activeLoans,
                totalOutstanding,
                totalUnpaidInterest
            },
            contributions: {
                history: contributions,
                lastPaid: contributions.find(c => c.status === 'paid')?.paidDate,
                pendingCount: contributions.filter(c => c.status === 'pending').length
            },
            pendingPaymentsCount: pendingPayments
        }
    });
});

// ==================== GENERAL DASHBOARD (Role-based) ====================

export const getDashboard = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const userRole = req.user?.role;

    switch (userRole) {
        case 'super_admin':
            return getSuperAdminDashboard(req, res, next);
        case 'admin':
            // Admin sees similar to super admin but with less financial detail
            return getSuperAdminDashboard(req, res, next); // Simplified version
        case 'approver':
            return getApproverDashboard(req, res, next);
        default:
            return getMemberDashboard(req, res, next);
    }
});