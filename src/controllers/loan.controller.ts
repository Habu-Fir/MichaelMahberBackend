import { Request, Response, NextFunction } from 'express';
import Loan from '../models/Loan';
import User from '../models/User';
import asyncHandler from '../utils/asyncHandler';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../middleware/auth';
import { generateLoanNumber } from '../utils/generateLoanNumber';
import systemConfigService from '../services/systemConfig.service';

// ==================== HELPER: UPDATE LOAN INTEREST ====================
const updateLoanInterest = async (loan: any) => {
    const dailyRate = getDailyRate(loan.interestRate);
    const now = new Date();
    const lastCalc = loan.lastInterestCalculation || loan.disbursementDate || loan.requestDate;
    const daysDiff = Math.floor((now.getTime() - new Date(lastCalc).getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff > 0) {
        const newInterest = loan.remainingPrincipal * dailyRate * daysDiff;
        const roundedInterest = Math.round(newInterest * 100) / 100;

        loan.interestAccrued += roundedInterest;
        loan.lastInterestCalculation = now;
        await loan.save();

        console.log(`✅ Updated interest for loan ${loan.loanNumber}: +${roundedInterest} ETB (${daysDiff} days)`);
        return roundedInterest;
    }
    return 0;
};

// ==================== HELPER FUNCTIONS ====================
const getDailyRate = (monthlyRate: number): number => {
    return (monthlyRate / 100) / 30;
};

// ==================== GET ALL LOANS (with pagination and filters) ====================
export const getLoans = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const { status, memberId, page = 1, limit = 100 } = req.query;

    // Build filter
    const filter: any = {};

    // Apply status filter ONLY if specifically requested
    if (status && status !== 'all') {
        filter.status = status;
    }
    // If no status filter or status === 'all', return ALL loans

    if (memberId) filter.memberId = memberId;

    console.log('📋 GET LOANS - Filter:', filter);
    console.log('📋 Page:', page, 'Limit:', limit);

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const [loans, total] = await Promise.all([
        Loan.find(filter)
            .populate('memberId', 'name email')
            .populate('signatures.memberId', 'name')
            .populate('paymentHistory.approvedBy', 'name')
            .skip(skip)
            .limit(parseInt(limit as string))
            .sort('-requestDate'),
        Loan.countDocuments(filter)
    ]);

    console.log(`✅ Found ${loans.length} loans, Total in DB: ${total}`);

    res.status(200).json({
        success: true,
        count: loans.length,
        total,
        page: parseInt(page as string),
        pages: Math.ceil(total / parseInt(limit as string)),
        data: loans
    });
});

// ==================== REQUEST LOAN ====================
export const requestLoan = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    console.log('\n📝 ===== NEW LOAN REQUEST =====');
    console.log('Request body:', req.body);

    const { principal, purpose, notes } = req.body;
    const memberId = req.user?._id;

    if (!principal || principal < 100) {
        return next(new ErrorResponse('Loan amount must be at least 100 ETB', 400));
    }

    if (!purpose) {
        return next(new ErrorResponse('Loan purpose is required', 400));
    }

    // Check if loan amount is available
    const isAvailable = await systemConfigService.isLoanAmountAvailable(principal);
    if (!isAvailable) {
        const totalAvailable = await systemConfigService.getTotalAvailable();
        return next(new ErrorResponse(
            `Insufficient funds. Total available: ${totalAvailable.toLocaleString()} ETB. Your requested amount: ${principal.toLocaleString()} ETB`,
            400
        ));
    }

    const totalMembers = await User.countDocuments({
        isActive: true,
        role: { $in: ['member', 'approver', 'admin', 'super_admin'] }
    });

    const requiredSignatures = Math.floor(totalMembers / 2) + 1;
    console.log(`📊 Total members: ${totalMembers}, Required (>50%): ${requiredSignatures}`);

    const member = await User.findById(memberId);
    if (!member) {
        return next(new ErrorResponse('Member not found', 404));
    }

    const loanNumber = await generateLoanNumber();
    console.log(`🔢 Generated loan number: ${loanNumber}`);

    const loan = new Loan({
        loanNumber,
        memberId,
        memberName: member.name,
        principal,
        interestRate: 1.5,
        remainingPrincipal: principal,
        requiredSignatures,
        purpose,
        notes,
        status: 'pending',
        requestDate: new Date(),
        lastInterestCalculation: new Date(),
        signatures: [],
        paymentHistory: [],
        pendingPayments: [],
        interestAccrued: 0,
        interestPaid: 0,
        amountPaid: 0
    });

    console.log('💾 Saving loan document...');
    await loan.save();
    console.log('✅ Loan saved with number:', loan.loanNumber);

    res.status(201).json({
        success: true,
        message: 'Loan request submitted successfully',
        data: {
            loanNumber: loan.loanNumber,
            principal: loan.principal,
            requiredSignatures: loan.requiredSignatures,
            status: loan.status,
            totalAvailable: await systemConfigService.getTotalAvailable()
        }
    });
});

// ==================== GET LOAN BY ID ====================
export const getLoanById = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    console.log('\n🔍 ===== GET LOAN BY ID =====');
    console.log('Requested loan ID:', id);

    // Validate if ID is a valid MongoDB ObjectId
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        console.log('❌ Invalid loan ID format');
        return next(new ErrorResponse('Invalid loan ID format', 400));
    }

    try {
        const loan = await Loan.findById(id)
            .populate('memberId', 'name email')
            .populate('signatures.memberId', 'name')
            .populate('paymentHistory.approvedBy', 'name');

        if (!loan) {
            console.log('❌ Loan not found in database');
            return next(new ErrorResponse('Loan not found', 404));
        }

        console.log('📊 Loan found:', {
            loanId: loan._id,
            loanNumber: loan.loanNumber,
            memberName: loan.memberName,
            status: loan.status,
            principal: loan.principal
        });

        res.status(200).json({
            success: true,
            data: loan
        });
    } catch (error) {
        console.error('❌ Error fetching loan:', error);
        return next(new ErrorResponse('Error fetching loan', 500));
    }
});

// ==================== GET MY LOANS ====================
export const getMyLoans = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const memberId = req.user?._id;
    const loans = await Loan.find({ memberId }).sort('-requestDate');

    res.status(200).json({
        success: true,
        count: loans.length,
        data: loans
    });
});

// ==================== SIGN LOAN ====================
export const signLoan = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const memberId = req.user?._id;
    const memberName = req.user?.name;

    const loan = await Loan.findById(id);

    if (!loan) {
        return next(new ErrorResponse('Loan not found', 404));
    }

    if (loan.status !== 'pending') {
        return next(new ErrorResponse('This loan is not available for signing', 400));
    }

    if (loan.memberId.toString() === memberId?.toString()) {
        return next(new ErrorResponse('You cannot sign your own loan request', 400));
    }

    const alreadySigned = loan.signatures.some(
        sig => sig.memberId.toString() === memberId?.toString()
    );

    if (alreadySigned) {
        return next(new ErrorResponse('You have already signed this loan', 400));
    }

    loan.signatures.push({
        memberId: memberId!,
        signedAt: new Date(),
        memberName
    });

    if (loan.signatures.length >= loan.requiredSignatures) {
        loan.status = 'ready_for_approval';
        console.log(`🎉 Loan reached ${loan.signatures.length} signatures -> ready_for_approval`);
    }

    await loan.save();

    res.status(200).json({
        success: true,
        message: 'Loan signed successfully',
        data: {
            signatures: loan.signatures.length,
            required: loan.requiredSignatures,
            status: loan.status,
            progress: Math.round((loan.signatures.length / loan.requiredSignatures) * 100)
        }
    });
});

// ==================== APPROVE LOAN ====================
export const approveLoan = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const loan = await Loan.findById(id);

    if (!loan) {
        return next(new ErrorResponse('Loan not found', 404));
    }

    if (loan.status !== 'ready_for_approval') {
        return next(new ErrorResponse('Loan is not ready for approval', 400));
    }

    if (loan.signatures.length < loan.requiredSignatures) {
        loan.status = 'pending';
        await loan.save();
        return next(new ErrorResponse('Insufficient signatures for approval', 400));
    }

    loan.status = 'approved';
    loan.approvalDate = new Date();

    await loan.save();

    res.status(200).json({
        success: true,
        message: 'Loan approved successfully',
        data: {
            loanNumber: loan.loanNumber,
            status: loan.status,
            approvalDate: loan.approvalDate
        }
    });
});

// ==================== DISBURSE LOAN ====================
export const disburseLoan = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { receiptUrl, notes } = req.body;

    const loan = await Loan.findById(id);

    if (!loan) {
        return next(new ErrorResponse('Loan not found', 404));
    }

    if (loan.status !== 'approved') {
        return next(new ErrorResponse('Loan must be approved first', 400));
    }

    loan.status = 'active';
    loan.disbursementDate = new Date();
    loan.disbursementReceiptUrl = receiptUrl;
    loan.notes = notes || loan.notes;
    loan.lastInterestCalculation = new Date();

    await loan.save();

    res.status(200).json({
        success: true,
        message: 'Loan disbursed successfully',
        data: {
            loanNumber: loan.loanNumber,
            status: loan.status,
            disbursementDate: loan.disbursementDate
        }
    });
});

// ==================== REQUEST PAYMENT ====================
export const requestPayment = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { amount, paymentMethod, receiptUrl, notes } = req.body;
    const memberId = req.user?._id;

    console.log('\n📤 ===== PAYMENT REQUEST =====');
    console.log(`Loan ID: ${id}`);
    console.log(`Payment Amount: ${amount} ETB`);

    const loan = await Loan.findById(id);

    if (!loan) {
        return next(new ErrorResponse('Loan not found', 404));
    }

    if (loan.memberId.toString() !== memberId?.toString()) {
        return next(new ErrorResponse('Not authorized to request payment for this loan', 403));
    }

    if (loan.status !== 'active') {
        return next(new ErrorResponse('Loan is not active', 400));
    }

    if (amount <= 0) {
        return next(new ErrorResponse('Payment amount must be positive', 400));
    }

    const pendingPayment = {
        amount,
        paymentMethod,
        receiptUrl,
        notes,
        requestedAt: new Date(),
        status: 'pending' as const
    };

    if (!loan.pendingPayments) {
        loan.pendingPayments = [];
    }

    loan.pendingPayments.push(pendingPayment);
    loan.status = 'payment_pending';

    await loan.save();

    res.status(200).json({
        success: true,
        message: 'Payment request submitted. Awaiting Super Admin approval.',
        data: {
            amount,
            status: 'pending',
            pendingPaymentsCount: loan.pendingPayments.filter(p => p.status === 'pending').length
        }
    });
});

// ==================== APPROVE PAYMENT ====================
export const approvePayment = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { paymentIndex, approve, notes } = req.body;
    const superAdminId = req.user?._id;

    console.log('\n✅ ===== APPROVE PAYMENT =====');
    console.log('Request params:', { id });
    console.log('Request body:', { paymentIndex, approve, notes });

    // Validate required fields
    if (paymentIndex === undefined || paymentIndex === null) {
        return next(new ErrorResponse('Payment index is required', 400));
    }

    if (typeof paymentIndex !== 'number') {
        return next(new ErrorResponse('Payment index must be a number', 400));
    }

    if (approve === undefined || approve === null) {
        return next(new ErrorResponse('Approve flag is required', 400));
    }

    const loan = await Loan.findById(id);

    if (!loan) {
        return next(new ErrorResponse('Loan not found', 404));
    }

    if (!loan.pendingPayments || loan.pendingPayments.length === 0) {
        return next(new ErrorResponse('No pending payments found', 400));
    }

    if (paymentIndex < 0 || paymentIndex >= loan.pendingPayments.length) {
        return next(new ErrorResponse(`Invalid payment index. Must be between 0 and ${loan.pendingPayments.length - 1}`, 400));
    }

    const pendingPayment = loan.pendingPayments[paymentIndex];

    if (pendingPayment.status !== 'pending') {
        return next(new ErrorResponse('This payment has already been processed', 400));
    }

    if (!approve) {
        // Reject payment
        pendingPayment.status = 'rejected';
        pendingPayment.reviewedAt = new Date();
        pendingPayment.reviewNotes = notes || 'Payment rejected';

        const hasOtherPending = loan.pendingPayments.some(p => p.status === 'pending');
        if (!hasOtherPending) {
            loan.status = 'active';
        }

        await loan.save();

        return res.json({
            success: true,
            message: 'Payment rejected',
            data: {
                approved: false,
                status: loan.status
            }
        });
    }

    // ===== APPROVE PAYMENT =====
    console.log('💰 Processing payment approval...');

    const dailyRate = getDailyRate(loan.interestRate);
    const now = new Date();
    const lastCalc = loan.lastInterestCalculation || loan.disbursementDate || loan.requestDate;
    const daysDiff = Math.floor((now.getTime() - lastCalc.getTime()) / (1000 * 60 * 60 * 24));

    let newInterest = 0;
    if (daysDiff > 0) {
        newInterest = loan.remainingPrincipal * dailyRate * daysDiff;
        newInterest = Math.round(newInterest * 100) / 100;
        console.log(`💰 New interest accrued: ${newInterest} ETB`);
    }

    loan.interestAccrued += newInterest;
    loan.lastInterestCalculation = now;

    const unpaidInterest = loan.interestAccrued - loan.interestPaid;

    let interestPortion = 0;
    let principalPortion = 0;

    if (unpaidInterest > 0) {
        if (pendingPayment.amount <= unpaidInterest) {
            interestPortion = pendingPayment.amount;
            principalPortion = 0;
        } else {
            interestPortion = unpaidInterest;
            principalPortion = pendingPayment.amount - unpaidInterest;
        }
    } else {
        principalPortion = pendingPayment.amount;
        interestPortion = 0;
    }

    console.log('💰 Payment split:', { interestPortion, principalPortion });

    loan.interestPaid += interestPortion;
    loan.amountPaid += pendingPayment.amount;
    loan.remainingPrincipal -= principalPortion;

    if (loan.remainingPrincipal < 0) loan.remainingPrincipal = 0;

    loan.paymentHistory.push({
        amount: pendingPayment.amount,
        principalPortion,
        interestPortion,
        date: now,
        paymentMethod: pendingPayment.paymentMethod,
        receiptUrl: pendingPayment.receiptUrl,
        notes: pendingPayment.notes,
        approvedBy: superAdminId,
        approvedAt: now
    });

    pendingPayment.status = 'approved';
    pendingPayment.reviewedAt = now;
    pendingPayment.reviewNotes = notes || 'Payment approved';

    // Update interest in system config
    if (interestPortion > 0) {
        await systemConfigService.updateInterest(interestPortion);
    }

    const remainingUnpaidInterest = loan.interestAccrued - loan.interestPaid;
    if (loan.remainingPrincipal <= 0 && remainingUnpaidInterest <= 0.01) {
        loan.status = 'completed';
        loan.completedDate = now;
        console.log(`🏁 Loan completed!`);
    } else {
        loan.status = 'active';
    }

    await loan.save();
    console.log('✅ Loan saved successfully');

    res.status(200).json({
        success: true,
        message: 'Payment approved and recorded successfully',
        data: {
            amount: pendingPayment.amount,
            principalPortion,
            interestPortion,
            remainingPrincipal: loan.remainingPrincipal,
            unpaidInterest: loan.interestAccrued - loan.interestPaid,
            totalInterestPaid: loan.interestPaid,
            totalAmountPaid: loan.amountPaid,
            status: loan.status
        }
    });
});

// ==================== GET PENDING PAYMENTS ====================
export const getPendingPayments = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    if (req.user?.role !== 'super_admin') {
        return next(new ErrorResponse('Not authorized to view pending payments', 403));
    }

    const loans = await Loan.find({
        'pendingPayments.status': 'pending'
    })
        .populate('memberId', 'name email')
        .select('loanNumber memberName principal remainingPrincipal interestRate pendingPayments');

    const pendingPaymentsList = loans.flatMap(loan => {
        const pendingPayments = loan.pendingPayments?.filter(p => p.status === 'pending') || [];

        return pendingPayments.map((p, index) => {
            const originalIndex = loan.pendingPayments?.findIndex(payment =>
                payment.requestedAt === p.requestedAt && payment.amount === p.amount
            ) || 0;

            return {
                loanId: loan._id,
                loanNumber: loan.loanNumber,
                memberName: loan.memberName,
                remainingPrincipal: loan.remainingPrincipal,
                interestRate: loan.interestRate,
                payment: {
                    amount: p.amount,
                    paymentMethod: p.paymentMethod,
                    receiptUrl: p.receiptUrl,
                    notes: p.notes,
                    requestedAt: p.requestedAt,
                    status: p.status,
                    index: originalIndex,
                    displayIndex: index
                }
            };
        });
    });

    res.status(200).json({
        success: true,
        count: pendingPaymentsList.length,
        data: pendingPaymentsList
    });
});

//
// import Loan from '../models/Loan';
// import User from '../models/User';
// import asyncHandler from '../utils/asyncHandler';
// import ErrorResponse from '../utils/errorResponse';
// import { AuthRequest } from '../middleware/auth';
// import { generateLoanNumber } from '../utils/generateLoanNumber';

// // ==================== HELPER FUNCTIONS ====================
// const getDailyRate = (monthlyRate: number): number => {
//     return (monthlyRate / 100) / 30;
// };

// // ==================== REQUEST LOAN ====================
// export const requestLoan = asyncHandler(async (
//     req: AuthRequest,
//     res: Response,
//     next: NextFunction
// ) => {
//     console.log('\n📝 ===== NEW LOAN REQUEST =====');
//     console.log('Request body:', req.body);

//     const { principal, purpose, notes } = req.body;
//     const memberId = req.user?._id;

//     if (!principal || principal < 100) {
//         return next(new ErrorResponse('Loan amount must be at least 100 ETB', 400));
//     }

//     if (!purpose) {
//         return next(new ErrorResponse('Loan purpose is required', 400));
//     }

//     const totalMembers = await User.countDocuments({
//         isActive: true,
//         role: { $in: ['member', 'approver', 'admin', 'super_admin'] }
//     });

//     const requiredSignatures = Math.floor(totalMembers / 2) + 1;
//     console.log(`📊 Total members: ${totalMembers}, Required (>50%): ${requiredSignatures}`);

//     const member = await User.findById(memberId);
//     if (!member) {
//         return next(new ErrorResponse('Member not found', 404));
//     }

//     const loanNumber = await generateLoanNumber();
//     console.log(`🔢 Generated loan number: ${loanNumber}`);

//     const loan = new Loan({
//         loanNumber,
//         memberId,
//         memberName: member.name,
//         principal,
//         interestRate: 3,
//         remainingPrincipal: principal,
//         requiredSignatures,
//         purpose,
//         notes,
//         status: 'pending',
//         requestDate: new Date(),
//         lastInterestCalculation: new Date(),
//         signatures: [],
//         paymentHistory: [],
//         pendingPayments: [],
//         interestAccrued: 0,
//         interestPaid: 0,
//         amountPaid: 0
//     });

//     console.log('💾 Saving loan document...');
//     await loan.save();
//     console.log('✅ Loan saved with number:', loan.loanNumber);

//     res.status(201).json({
//         success: true,
//         message: 'Loan request submitted successfully',
//         data: {
//             loanNumber: loan.loanNumber,
//             principal: loan.principal,
//             requiredSignatures: loan.requiredSignatures,
//             status: loan.status
//         }
//     });
// });

// // ==================== GET ALL LOANS ====================
// export const getLoans = asyncHandler(async (
//     req: AuthRequest,
//     res: Response,
//     next: NextFunction
// ) => {
//     const { status, memberId, page = 1, limit = 10 } = req.query;

//     const filter: any = {};

//     // Apply status filter ONLY if specifically requested
//     if (status && status !== 'all') {
//         filter.status = status;
//     }
//     // If no status filter, return ALL loans including 'payment_pending'

//     if (memberId) filter.memberId = memberId;

//     console.log('📋 User accessing loans:', {
//         userId: req.user?._id,
//         role: req.user?.role,
//         filter
//     });

//     const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

//     const [loans, total] = await Promise.all([
//         Loan.find(filter)
//             .populate('memberId', 'name email')
//             .populate('signatures.memberId', 'name')
//             .populate('paymentHistory.approvedBy', 'name')
//             .skip(skip)
//             .limit(parseInt(limit as string))
//             .sort('-requestDate'),
//         Loan.countDocuments(filter)
//     ]);

//     console.log(`✅ Returning ${loans.length} loans to user with role: ${req.user?.role}`);

//     res.status(200).json({
//         success: true,
//         count: loans.length,
//         total,
//         page: parseInt(page as string),
//         pages: Math.ceil(total / parseInt(limit as string)),
//         data: loans
//     });
// });

// // ==================== GET LOAN BY ID ====================
// // FIXED: Handle null memberId gracefully
// export const getLoanById = asyncHandler(async (
//     req: AuthRequest,
//     res: Response,
//     next: NextFunction
// ) => {
//     const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

//     console.log('\n🔍 ===== GET LOAN BY ID =====');
//     console.log('Requested loan ID:', id);
//     console.log('User making request:', {
//         id: req.user?._id,
//         email: req.user?.email,
//         role: req.user?.role
//     });

//     // Validate if ID is a valid MongoDB ObjectId
//     if (!id.match(/^[0-9a-fA-F]{24}$/)) {
//         console.log('❌ Invalid loan ID format');
//         return next(new ErrorResponse('Invalid loan ID format', 400));
//     }

//     try {
//         const loan = await Loan.findById(id)
//             .populate('memberId', 'name email')
//             .populate('signatures.memberId', 'name')
//             .populate('paymentHistory.approvedBy', 'name');

//         if (!loan) {
//             console.log('❌ Loan not found in database');
//             return next(new ErrorResponse('Loan not found', 404));
//         }

//         // Handle case where memberId is null
//         if (!loan.memberId) {
//             console.log('⚠️ Loan has null memberId:', {
//                 loanId: loan._id,
//                 loanNumber: loan.loanNumber,
//                 memberName: loan.memberName || 'Unknown'
//             });

//             // Return loan with null memberId handled
//             return res.status(200).json({
//                 success: true,
//                 data: {
//                     ...loan.toObject(),
//                     memberId: null,
//                     memberName: loan.memberName || 'Deleted Member'
//                 }
//             });
//         }

//         console.log('📊 Loan found:', {
//             loanId: loan._id,
//             loanNumber: loan.loanNumber,
//             memberId: loan.memberId._id,
//             memberName: loan.memberName,
//             status: loan.status
//         });

//         res.status(200).json({
//             success: true,
//             data: loan
//         });
//     } catch (error) {
//         console.error('❌ Error fetching loan:', error);
//         return next(new ErrorResponse('Error fetching loan', 500));
//     }
// });
// // ==================== GET MY LOANS ====================
// // Keep this for backward compatibility, but main getAllLoans is now for everyone
// export const getMyLoans = asyncHandler(async (
//     req: AuthRequest,
//     res: Response,
//     next: NextFunction
// ) => {
//     const memberId = req.user?._id;
//     const loans = await Loan.find({ memberId }).sort('-requestDate');

//     res.status(200).json({
//         success: true,
//         count: loans.length,
//         data: loans
//     });
// });

// // ==================== SIGN LOAN ====================
// export const signLoan = asyncHandler(async (
//     req: AuthRequest,
//     res: Response,
//     next: NextFunction
// ) => {
//     const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
//     const memberId = req.user?._id;
//     const memberName = req.user?.name;

//     const loan = await Loan.findById(id);

//     if (!loan) {
//         return next(new ErrorResponse('Loan not found', 404));
//     }

//     // Can only sign pending loans
//     if (loan.status !== 'pending') {
//         return next(new ErrorResponse('This loan is not available for signing', 400));
//     }

//     // Members cannot sign their own loan
//     if (loan.memberId.toString() === memberId?.toString()) {
//         return next(new ErrorResponse('You cannot sign your own loan request', 400));
//     }

//     // Check if already signed
//     const alreadySigned = loan.signatures.some(
//         sig => sig.memberId.toString() === memberId?.toString()
//     );

//     if (alreadySigned) {
//         return next(new ErrorResponse('You have already signed this loan', 400));
//     }

//     // Add signature
//     loan.signatures.push({
//         memberId: memberId!,
//         signedAt: new Date(),
//         memberName
//     });

//     // Check if we've reached required signatures (>50%)
//     if (loan.signatures.length >= loan.requiredSignatures) {
//         loan.status = 'ready_for_approval';
//         console.log(`🎉 Loan reached ${loan.signatures.length} signatures -> ready_for_approval`);
//     }

//     await loan.save();

//     res.status(200).json({
//         success: true,
//         message: 'Loan signed successfully',
//         data: {
//             signatures: loan.signatures.length,
//             required: loan.requiredSignatures,
//             status: loan.status,
//             progress: Math.round((loan.signatures.length / loan.requiredSignatures) * 100)
//         }
//     });
// });

// // ==================== APPROVE LOAN ====================
// export const approveLoan = asyncHandler(async (
//     req: AuthRequest,
//     res: Response,
//     next: NextFunction
// ) => {
//     const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

//     const loan = await Loan.findById(id);

//     if (!loan) {
//         return next(new ErrorResponse('Loan not found', 404));
//     }

//     if (loan.status !== 'ready_for_approval') {
//         return next(new ErrorResponse('Loan is not ready for approval', 400));
//     }

//     if (loan.signatures.length < loan.requiredSignatures) {
//         loan.status = 'pending';
//         await loan.save();
//         return next(new ErrorResponse('Insufficient signatures for approval', 400));
//     }

//     loan.status = 'approved';
//     loan.approvalDate = new Date();

//     await loan.save();

//     res.status(200).json({
//         success: true,
//         message: 'Loan approved successfully',
//         data: {
//             loanNumber: loan.loanNumber,
//             status: loan.status,
//             approvalDate: loan.approvalDate
//         }
//     });
// });

// // ==================== DISBURSE LOAN ====================
// export const disburseLoan = asyncHandler(async (
//     req: AuthRequest,
//     res: Response,
//     next: NextFunction
// ) => {
//     const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
//     const { receiptUrl, notes } = req.body;

//     const loan = await Loan.findById(id);

//     if (!loan) {
//         return next(new ErrorResponse('Loan not found', 404));
//     }

//     if (loan.status !== 'approved') {
//         return next(new ErrorResponse('Loan must be approved first', 400));
//     }

//     loan.status = 'active';
//     loan.disbursementDate = new Date();
//     loan.disbursementReceiptUrl = receiptUrl;
//     loan.notes = notes || loan.notes;
//     loan.lastInterestCalculation = new Date();

//     await loan.save();

//     res.status(200).json({
//         success: true,
//         message: 'Loan disbursed successfully',
//         data: {
//             loanNumber: loan.loanNumber,
//             status: loan.status,
//             disbursementDate: loan.disbursementDate
//         }
//     });
// });

// // ==================== REQUEST PAYMENT ====================
// export const requestPayment = asyncHandler(async (
//     req: AuthRequest,
//     res: Response,
//     next: NextFunction
// ) => {
//     const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
//     const { amount, paymentMethod, receiptUrl, notes } = req.body;
//     const memberId = req.user?._id;

//     console.log('\n📤 ===== PAYMENT REQUEST =====');
//     console.log(`Loan ID: ${id}`);
//     console.log(`Payment Amount: ${amount} ETB`);

//     const loan = await Loan.findById(id);

//     if (!loan) {
//         return next(new ErrorResponse('Loan not found', 404));
//     }

//     if (loan.memberId.toString() !== memberId?.toString()) {
//         return next(new ErrorResponse('Not authorized to request payment for this loan', 403));
//     }

//     if (loan.status !== 'active') {
//         return next(new ErrorResponse('Loan is not active', 400));
//     }

//     if (amount <= 0) {
//         return next(new ErrorResponse('Payment amount must be positive', 400));
//     }

//     const pendingPayment = {
//         amount,
//         paymentMethod,
//         receiptUrl,
//         notes,
//         requestedAt: new Date(),
//         status: 'pending' as const
//     };

//     if (!loan.pendingPayments) {
//         loan.pendingPayments = [];
//     }

//     loan.pendingPayments.push(pendingPayment);
//     loan.status = 'payment_pending';

//     await loan.save();

//     res.status(200).json({
//         success: true,
//         message: 'Payment request submitted. Awaiting Super Admin approval.',
//         data: {
//             amount,
//             status: 'pending',
//             pendingPaymentsCount: loan.pendingPayments.filter(p => p.status === 'pending').length
//         }
//     });
// });

// // ==================== APPROVE PAYMENT ====================
// export const approvePayment = asyncHandler(async (
//     req: AuthRequest,
//     res: Response,
//     next: NextFunction
// ) => {
//     const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
//     const { paymentIndex, approve, notes } = req.body;
//     const superAdminId = req.user?._id;

//     console.log('\n✅ ===== APPROVE PAYMENT =====');
//     console.log('Request params:', { id });
//     console.log('Request body:', { paymentIndex, approve, notes, type: typeof paymentIndex });
//     console.log('User:', { id: superAdminId, role: req.user?.role });

//     // Validate required fields
//     if (paymentIndex === undefined || paymentIndex === null) {
//         console.log('❌ Payment index is missing');
//         return next(new ErrorResponse('Payment index is required', 400));
//     }

//     if (typeof paymentIndex !== 'number') {
//         console.log('❌ Payment index must be a number, received:', typeof paymentIndex);
//         return next(new ErrorResponse('Payment index must be a number', 400));
//     }

//     if (approve === undefined || approve === null) {
//         console.log('❌ Approve flag is missing');
//         return next(new ErrorResponse('Approve flag is required', 400));
//     }

//     const loan = await Loan.findById(id);

//     if (!loan) {
//         console.log('❌ Loan not found for id:', id);
//         return next(new ErrorResponse('Loan not found', 404));
//     }

//     console.log('📊 Loan found:', {
//         loanId: loan._id,
//         loanNumber: loan.loanNumber,
//         status: loan.status,
//         pendingPaymentsCount: loan.pendingPayments?.length
//     });

//     if (!loan.pendingPayments || loan.pendingPayments.length === 0) {
//         console.log('❌ No pending payments found for loan');
//         return next(new ErrorResponse('No pending payments found', 400));
//     }

//     // Check if paymentIndex is valid
//     if (paymentIndex < 0 || paymentIndex >= loan.pendingPayments.length) {
//         console.log('❌ Invalid payment index:', paymentIndex, 'Available indices:', loan.pendingPayments.length);
//         return next(new ErrorResponse(`Invalid payment index. Must be between 0 and ${loan.pendingPayments.length - 1}`, 400));
//     }

//     const pendingPayment = loan.pendingPayments[paymentIndex];

//     console.log('📊 Pending payment found:', {
//         amount: pendingPayment.amount,
//         method: pendingPayment.paymentMethod,
//         status: pendingPayment.status,
//         requestedAt: pendingPayment.requestedAt
//     });

//     if (pendingPayment.status !== 'pending') {
//         console.log('❌ Payment already processed. Current status:', pendingPayment.status);
//         return next(new ErrorResponse('This payment has already been processed', 400));
//     }

//     if (!approve) {
//         // Reject payment
//         pendingPayment.status = 'rejected';
//         pendingPayment.reviewedAt = new Date();
//         pendingPayment.reviewNotes = notes || 'Payment rejected';

//         const hasOtherPending = loan.pendingPayments.some(p => p.status === 'pending');
//         if (!hasOtherPending) {
//             loan.status = 'active';
//         }

//         await loan.save();
//         console.log('✅ Payment rejected successfully');

//         return res.json({
//             success: true,
//             message: 'Payment rejected',
//             data: {
//                 approved: false,
//                 status: loan.status
//             }
//         });
//     }

//     // ===== APPROVE PAYMENT - NOW UPDATE THE LOAN =====
//     console.log('💰 Processing payment approval...');

//     const dailyRate = getDailyRate(loan.interestRate);
//     const now = new Date();
//     const lastCalc = loan.lastInterestCalculation || loan.disbursementDate || loan.requestDate;
//     const daysDiff = Math.floor((now.getTime() - lastCalc.getTime()) / (1000 * 60 * 60 * 24));

//     console.log('📅 Interest calculation:', { dailyRate, daysDiff });

//     let newInterest = 0;
//     if (daysDiff > 0) {
//         newInterest = loan.remainingPrincipal * dailyRate * daysDiff;
//         newInterest = Math.round(newInterest * 100) / 100;
//         console.log(`💰 New interest accrued: ${newInterest} ETB`);
//     }

//     loan.interestAccrued += newInterest;
//     loan.lastInterestCalculation = now;

//     const unpaidInterest = loan.interestAccrued - loan.interestPaid;

//     let interestPortion = 0;
//     let principalPortion = 0;

//     if (unpaidInterest > 0) {
//         if (pendingPayment.amount <= unpaidInterest) {
//             interestPortion = pendingPayment.amount;
//             principalPortion = 0;
//         } else {
//             interestPortion = unpaidInterest;
//             principalPortion = pendingPayment.amount - unpaidInterest;
//         }
//     } else {
//         principalPortion = pendingPayment.amount;
//         interestPortion = 0;
//     }

//     console.log('💰 Payment split:', { interestPortion, principalPortion });

//     loan.interestPaid += interestPortion;
//     loan.amountPaid += pendingPayment.amount;
//     loan.remainingPrincipal -= principalPortion;

//     if (loan.remainingPrincipal < 0) loan.remainingPrincipal = 0;

//     loan.paymentHistory.push({
//         amount: pendingPayment.amount,
//         principalPortion,
//         interestPortion,
//         date: now,
//         paymentMethod: pendingPayment.paymentMethod,
//         receiptUrl: pendingPayment.receiptUrl,
//         notes: pendingPayment.notes,
//         approvedBy: superAdminId,
//         approvedAt: now
//     });

//     pendingPayment.status = 'approved';
//     pendingPayment.reviewedAt = now;
//     pendingPayment.reviewNotes = notes || 'Payment approved';

//     const remainingUnpaidInterest = loan.interestAccrued - loan.interestPaid;
//     if (loan.remainingPrincipal <= 0 && remainingUnpaidInterest <= 0.01) {
//         loan.status = 'completed';
//         loan.completedDate = now;
//         console.log(`🏁 Loan completed!`);
//     } else {
//         loan.status = 'active';
//     }

//     await loan.save();
//     console.log('✅ Loan saved successfully');

//     res.status(200).json({
//         success: true,
//         message: 'Payment approved and recorded successfully',
//         data: {
//             amount: pendingPayment.amount,
//             principalPortion,
//             interestPortion,
//             remainingPrincipal: loan.remainingPrincipal,
//             unpaidInterest: loan.interestAccrued - loan.interestPaid,
//             totalInterestPaid: loan.interestPaid,
//             totalAmountPaid: loan.amountPaid,
//             status: loan.status
//         }
//     });
// });
// // ==================== GET PENDING PAYMENTS ====================
// // ==================== GET PENDING PAYMENTS ====================
// export const getPendingPayments = asyncHandler(async (
//     req: AuthRequest,
//     res: Response,
//     next: NextFunction
// ) => {
//     if (req.user?.role !== 'super_admin') {
//         return next(new ErrorResponse('Not authorized to view pending payments', 403));
//     }

//     // Find loans that have at least one pending payment
//     const loans = await Loan.find({
//         'pendingPayments.status': 'pending'  // Only loans with pending payments
//     })
//         .populate('memberId', 'name email')
//         .select('loanNumber memberName principal remainingPrincipal pendingPayments');

//     console.log(`📋 Found ${loans.length} loans with pending payments`);

//     // Extract ONLY pending payments (filter out approved/rejected)
//     const pendingPaymentsList = loans.flatMap(loan => {
//         // Filter to get only pending payments
//         const pendingPayments = loan.pendingPayments?.filter(p => p.status === 'pending') || [];

//         console.log(`🔍 Processing loan ${loan.loanNumber}:`, {
//             totalPayments: loan.pendingPayments?.length,
//             pendingCount: pendingPayments.length,
//             pendingAmounts: pendingPayments.map(p => p.amount)
//         });

//         // Map each pending payment to the response format
//         return pendingPayments.map((p, index) => {
//             // Find the original index in the full array (for reference)
//             const originalIndex = loan.pendingPayments?.findIndex(payment =>
//                 payment.requestedAt === p.requestedAt && payment.amount === p.amount
//             ) || 0;

//             return {
//                 loanId: loan._id,
//                 loanNumber: loan.loanNumber,
//                 memberName: loan.memberName,
//                 remainingPrincipal: loan.remainingPrincipal,
//                 payment: {
//                     amount: p.amount,
//                     paymentMethod: p.paymentMethod,
//                     receiptUrl: p.receiptUrl,
//                     notes: p.notes,
//                     requestedAt: p.requestedAt,
//                     status: p.status,
//                     index: originalIndex,  // Use original index for reference
//                     displayIndex: index     // Display index for UI
//                 }
//             };
//         });
//     });

//     console.log(`📊 Returning ${pendingPaymentsList.length} pending payments`);

//     res.status(200).json({
//         success: true,
//         count: pendingPaymentsList.length,
//         data: pendingPaymentsList
//     });
// });