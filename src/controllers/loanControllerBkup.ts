// import { Request, Response, NextFunction } from 'express';
// import Loan from '../models/Loan';
// import User from '../models/User';
// import asyncHandler from '../utils/asyncHandler';
// import ErrorResponse from '../utils/errorResponse';
// import { AuthRequest } from '../middleware/auth';
// import { generateLoanNumber } from '../utils/generateLoanNumber';



// // ==================== HELPER FUNCTIONS ====================

// const getDailyRate = (monthlyRate: number): number => {
//     return (monthlyRate / 100) / 30; // 3% → 0.001
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

//     // Validation
//     if (!principal || principal < 100) {
//         return next(new ErrorResponse('Loan amount must be at least 100 ETB', 400));
//     }

//     if (!purpose) {
//         return next(new ErrorResponse('Loan purpose is required', 400));
//     }

//     // Count ALL active members
//     const totalMembers = await User.countDocuments({
//         isActive: true,
//         role: { $in: ['member', 'approver', 'admin', 'super_admin'] }
//     });

//     // Calculate >50% required signatures
//     const requiredSignatures = Math.floor(totalMembers / 2) + 1;
//     console.log(`📊 Total members: ${totalMembers}, Required (>50%): ${requiredSignatures}`);

//     // Get member
//     const member = await User.findById(memberId);
//     if (!member) {
//         return next(new ErrorResponse('Member not found', 404));
//     }

//     // Generate loan number BEFORE creating the loan
//     const loanNumber = await generateLoanNumber();
//     console.log(`🔢 Generated loan number: ${loanNumber}`);

//     // Create loan with explicit loanNumber
//     const loan = new Loan({
//         loanNumber, // Set it explicitly
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

// // ==================== GET MY LOANS ====================

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

// // ==================== GET LOAN BY ID ====================

// // ==================== GET LOAN BY ID ====================

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

//     const loan = await Loan.findById(id)
//         .populate('memberId', 'name email')
//         .populate('signatures.memberId', 'name')
//         .populate('paymentHistory.approvedBy', 'name');

//     if (!loan) {
//         console.log('❌ Loan not found');
//         return next(new ErrorResponse('Loan not found', 404));
//     }

//     console.log('📊 Loan found:', {
//         loanId: loan._id,
//         loanNumber: loan.loanNumber,
//         memberId: loan.memberId._id,
//         memberName: loan.memberName
//     });

//     // For members, check if they own this loan
//     if (req.user?.role === 'member') {
//         const loanMemberId = loan.memberId._id.toString();
//         const userId = req.user._id.toString();

//         console.log('🔑 Member access check:');
//         console.log('  - Loan member ID:', loanMemberId);
//         console.log('  - User ID:', userId);
//         console.log('  - Match:', loanMemberId === userId);

//         if (loanMemberId !== userId) {
//             console.log('❌ Access denied - member trying to view someone else\'s loan');
//             return next(new ErrorResponse('Not authorized to view this loan', 403));
//         }
//         console.log('✅ Access granted - member owns this loan');
//     }

//     // For admins/approvers/super_admins, allow access to any loan
//     if (['admin', 'approver', 'super_admin'].includes(req.user?.role || '')) {
//         console.log('✅ Access granted - admin/approver/super_admin');
//     }

//     res.status(200).json({
//         success: true,
//         data: loan
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

//     // Can only approve loans ready for approval
//     if (loan.status !== 'ready_for_approval') {
//         return next(new ErrorResponse('Loan is not ready for approval', 400));
//     }

//     // Verify enough signatures
//     if (loan.signatures.length < loan.requiredSignatures) {
//         loan.status = 'pending';
//         await loan.save();
//         return next(new ErrorResponse('Insufficient signatures for approval', 400));
//     }

//     // Update status
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

//     // Can only disburse approved loans
//     if (loan.status !== 'approved') {
//         return next(new ErrorResponse('Loan must be approved first', 400));
//     }

//     // Update loan
//     loan.status = 'active';
//     loan.disbursementDate = new Date();
//     loan.disbursementReceiptUrl = receiptUrl;
//     loan.notes = notes || loan.notes;
//     loan.lastInterestCalculation = new Date(); // Start counting interest from now

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

// // ==================== REQUEST PAYMENT (MEMBER UPLOADS RECEIPT) ====================

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

//     // Verify ownership
//     if (loan.memberId.toString() !== memberId?.toString()) {
//         return next(new ErrorResponse('Not authorized to request payment for this loan', 403));
//     }

//     // Can only request payment on active loans
//     if (loan.status !== 'active') {
//         return next(new ErrorResponse('Loan is not active', 400));
//     }

//     if (amount <= 0) {
//         return next(new ErrorResponse('Payment amount must be positive', 400));
//     }

//     // Create a pending payment record
//     const pendingPayment = {
//         amount,
//         paymentMethod,
//         receiptUrl,
//         notes,
//         requestedAt: new Date(),
//         status: 'pending' as const
//     };

//     // Initialize pendingPayments array if it doesn't exist
//     if (!loan.pendingPayments) {
//         loan.pendingPayments = [];
//     }

//     loan.pendingPayments.push(pendingPayment);

//     // Change status to indicate pending payment
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

// // ==================== APPROVE PAYMENT (SUPER ADMIN) ====================

// export const approvePayment = asyncHandler(async (
//     req: AuthRequest,
//     res: Response,
//     next: NextFunction
// ) => {
//     const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
//     const { paymentIndex, approve, notes } = req.body;
//     const superAdminId = req.user?._id;

//     console.log('\n✅ ===== APPROVE PAYMENT =====');
//     console.log(`Loan ID: ${id}`);
//     console.log(`Payment Index: ${paymentIndex}`);
//     console.log(`Approve: ${approve}`);

//     const loan = await Loan.findById(id);

//     if (!loan) {
//         return next(new ErrorResponse('Loan not found', 404));
//     }

//     // Check if there are pending payments
//     if (!loan.pendingPayments || loan.pendingPayments.length === 0) {
//         return next(new ErrorResponse('No pending payments found', 400));
//     }

//     const pendingPayment = loan.pendingPayments[paymentIndex];

//     if (!pendingPayment) {
//         return next(new ErrorResponse('Payment not found', 404));
//     }

//     if (pendingPayment.status !== 'pending') {
//         return next(new ErrorResponse('This payment has already been processed', 400));
//     }

//     if (!approve) {
//         // Reject payment
//         pendingPayment.status = 'rejected';
//         pendingPayment.reviewedAt = new Date();
//         pendingPayment.reviewNotes = notes || 'Payment rejected';

//         // Change status back to active if no other pending payments
//         const hasOtherPending = loan.pendingPayments.some(p => p.status === 'pending');
//         if (!hasOtherPending) {
//             loan.status = 'active';
//         }

//         await loan.save();

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

//     // Calculate daily interest rate
//     const dailyRate = getDailyRate(loan.interestRate);

//     // Calculate days since last calculation
//     const now = new Date();
//     const lastCalc = loan.lastInterestCalculation || loan.disbursementDate || loan.requestDate;
//     const daysDiff = Math.floor((now.getTime() - lastCalc.getTime()) / (1000 * 60 * 60 * 24));

//     // Calculate new interest accrued
//     let newInterest = 0;
//     if (daysDiff > 0) {
//         newInterest = loan.remainingPrincipal * dailyRate * daysDiff;
//         newInterest = Math.round(newInterest * 100) / 100;
//         console.log(`💰 New interest accrued: ${newInterest} ETB`);
//     }

//     // Update total accrued interest
//     loan.interestAccrued += newInterest;
//     loan.lastInterestCalculation = now;

//     // Calculate unpaid interest
//     const unpaidInterest = loan.interestAccrued - loan.interestPaid;

//     // Split payment between interest and principal
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

//     // Update loan
//     loan.interestPaid += interestPortion;
//     loan.amountPaid += pendingPayment.amount;
//     loan.remainingPrincipal -= principalPortion;

//     if (loan.remainingPrincipal < 0) loan.remainingPrincipal = 0;

//     // Record approved payment in history
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

//     // Update pending payment status
//     pendingPayment.status = 'approved';
//     pendingPayment.reviewedAt = now;
//     pendingPayment.reviewNotes = notes || 'Payment approved';

//     // Check if loan is fully paid
//     const remainingUnpaidInterest = loan.interestAccrued - loan.interestPaid;
//     if (loan.remainingPrincipal <= 0 && remainingUnpaidInterest <= 0.01) {
//         loan.status = 'completed';
//         loan.completedDate = now;
//         console.log(`🏁 Loan completed!`);
//     } else {
//         // Change status back to active
//         loan.status = 'active';
//     }

//     await loan.save();

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

// // ==================== GET ALL LOANS (Admin) ====================

// export const getLoans = asyncHandler(async (
//     req: Request,
//     res: Response,
//     next: NextFunction
// ) => {
//     const { status, memberId, page = 1, limit = 10 } = req.query;

//     const filter: any = {};
//     if (status) filter.status = status;
//     if (memberId) filter.memberId = memberId;

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

//     res.status(200).json({
//         success: true,
//         count: loans.length,
//         total,
//         page: parseInt(page as string),
//         pages: Math.ceil(total / parseInt(limit as string)),
//         data: loans
//     });
// });

// // ==================== GET PENDING PAYMENTS (Super Admin) ====================

// export const getPendingPayments = asyncHandler(async (
//     req: AuthRequest,
//     res: Response,
//     next: NextFunction
// ) => {
//     const loans = await Loan.find({
//         status: 'payment_pending',
//         'pendingPayments.status': 'pending'
//     })
//         .populate('memberId', 'name email')
//         .select('loanNumber memberName principal remainingPrincipal pendingPayments');

//     // Extract only pending payments
//     const pendingPaymentsList = loans.flatMap(loan =>
//         loan.pendingPayments
//             ?.filter(p => p.status === 'pending')
//             .map(p => ({
//                 loanId: loan._id,
//                 loanNumber: loan.loanNumber,
//                 memberName: loan.memberName,
//                 remainingPrincipal: loan.remainingPrincipal,
//                 payment: p
//             })) || []
//     );

//     res.status(200).json({
//         success: true,
//         count: pendingPaymentsList.length,
//         data: pendingPaymentsList
//     });
// });