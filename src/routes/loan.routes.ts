// import express from 'express';
// import { body } from 'express-validator';
// import { protect, authorize } from '../middleware/auth';
// import {
//   requestLoan,
//   getLoans,
//   getMyLoans,
//   getLoanById,
//   signLoan,
//   approveLoan,
//   disburseLoan,
//   requestPayment,
//   approvePayment,
//   getPendingPayments
// } from '../controllers/loan.controller';
// import Loan from '../models/Loan';

// const router = express.Router();

// // ==================== ALL ROUTES REQUIRE AUTHENTICATION ====================
// router.use(protect);

// // ==================== VALIDATION RULES ====================

// const validateLoanRequest = [
//   body('principal')
//     .notEmpty().withMessage('Principal amount is required')
//     .isFloat({ min: 100 }).withMessage('Principal must be at least 100 ETB'),

//   body('purpose')
//     .notEmpty().withMessage('Purpose is required')
//     .isIn(['business', 'education', 'medical', 'home', 'debt', 'other']).withMessage('Invalid purpose'),

//   body('notes')
//     .optional()
//     .isString().withMessage('Notes must be text')
//     .trim()
//     .escape()
// ];

// const validatePaymentRequest = [
//   body('amount')
//     .notEmpty().withMessage('Payment amount is required')
//     .isFloat({ min: 1 }).withMessage('Payment must be at least 1 ETB'),

//   body('paymentMethod')
//     .notEmpty().withMessage('Payment method is required')
//     .isIn(['cash', 'bank', 'mobile']).withMessage('Invalid payment method'),

//   body('receiptUrl')
//     .optional()
//     .isURL().withMessage('Receipt URL must be valid'),

//   body('notes')
//     .optional()
//     .isString().withMessage('Notes must be text')
//     .trim()
//     .escape()
// ];

// const validateApprovePayment = [
//   body('paymentIndex')
//     .notEmpty().withMessage('Payment index is required')
//     .isInt({ min: 0 }).withMessage('Payment index must be a positive number'),

//   body('approve')
//     .notEmpty().withMessage('Approve flag is required')
//     .isBoolean().withMessage('Approve must be true or false'),

//   body('notes')
//     .optional()
//     .isString().withMessage('Notes must be text')
//     .trim()
//     .escape()
// ];

// // ==================== TEST ENDPOINT (REMOVE AFTER TESTING) ====================

// /**
//  * @route   POST /api/loans/test/advance-days/:id/:days
//  * @desc    TEST ONLY: Simulate time passing for interest calculation
//  * @access  Private (Super Admin only for testing)
//  */
// router.post('/test/advance-days/:id/:days', authorize('super_admin'), async (req, res) => {
//   try {
//     const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
//     const daysParam = Array.isArray(req.params.days) ? req.params.days[0] : req.params.days;

//     const daysNum = parseInt(daysParam);

//     if (isNaN(daysNum) || daysNum <= 0) {
//       return res.status(400).json({
//         success: false,
//         message: 'Days must be a positive number'
//       });
//     }

//     const loan = await Loan.findById(id);
//     if (!loan) {
//       return res.status(404).json({ success: false, message: 'Loan not found' });
//     }

//     if (loan.status !== 'active') {
//       return res.status(400).json({
//         success: false,
//         message: 'Loan must be active to accrue interest'
//       });
//     }

//     const dailyRate = (loan.interestRate / 100) / 30;
//     const newInterest = loan.remainingPrincipal * dailyRate * daysNum;
//     const roundedInterest = Math.round(newInterest * 100) / 100;

//     loan.interestAccrued += roundedInterest;

//     const newDate = new Date(loan.lastInterestCalculation);
//     newDate.setDate(newDate.getDate() + daysNum);
//     loan.lastInterestCalculation = newDate;

//     await loan.save();

//     res.json({
//       success: true,
//       message: `Advanced ${daysNum} days, added ${roundedInterest.toFixed(2)} interest`,
//       data: {
//         remainingPrincipal: loan.remainingPrincipal,
//         interestAccrued: loan.interestAccrued,
//         interestPaid: loan.interestPaid,
//         unpaidInterest: loan.interestAccrued - loan.interestPaid
//       }
//     });
//   } catch (error: any) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// });

// // ==================== PUBLIC ROUTES (Any authenticated user) ====================

// /**
//  * @route   GET /api/loans
//  * @desc    Get all loans with filters - ALL USERS CAN ACCESS
//  * @access  Private (Any authenticated user)
//  * 
//  * IMPORTANT: This is now accessible to ALL users (including members)
//  * for complete transparency. Members need to see all loans to sign them.
//  */
// router.get('/', getLoans); // 👈 FIXED: Removed authorize middleware

// /**
//  * @route   GET /api/loans/my
//  * @desc    Get current user's loans
//  * @access  Private
//  */
// router.get('/my', getMyLoans);

// /**
//  * @route   GET /api/loans/:id
//  * @desc    Get single loan by ID
//  * @access  Private (All authenticated users)
//  */
// router.get('/:id', getLoanById);

// // ==================== MEMBER ROUTES ====================

// /**
//  * @route   POST /api/loans/request
//  * @desc    Request a new loan
//  * @access  Private (Any member)
//  */
// router.post('/request', validateLoanRequest, requestLoan);

// /**
//  * @route   POST /api/loans/:id/sign
//  * @desc    Sign to approve a loan
//  * @access  Private (All members except requester)
//  */
// router.post('/:id/sign', signLoan);

// /**
//  * @route   POST /api/loans/:id/request-payment
//  * @desc    Member requests payment (uploads receipt)
//  * @access  Private (Loan owner only)
//  */
// router.post('/:id/request-payment', validatePaymentRequest, requestPayment);

// // ==================== APPROVER ROUTES ====================

// /**
//  * @route   PUT /api/loans/:id/approve
//  * @desc    Final approval of loan after 50% signatures
//  * @access  Private (Approver, Super Admin)
//  */
// router.put('/:id/approve', authorize('approver', 'super_admin'), approveLoan);

// // ==================== SUPER ADMIN ROUTES ====================

// /**
//  * @route   POST /api/loans/:id/disburse
//  * @desc    Disburse loan money and upload receipt
//  * @access  Private (Super Admin ONLY)
//  */
// router.post('/:id/disburse', authorize('super_admin'), disburseLoan);

// /**
//  * @route   POST /api/loans/:id/approve-payment
//  * @desc    Super Admin approves or rejects a payment
//  * @access  Private (Super Admin ONLY)
//  */
// router.post('/:id/approve-payment',
//   authorize('super_admin'),
//   validateApprovePayment,
//   approvePayment
// );

// /**
//  * @route   GET /api/loans/admin/pending-payments
//  * @desc    Get all pending payments across all loans
//  * @access  Private (Super Admin ONLY)
//  */
// router.get('/admin/pending-payments',
//   authorize('super_admin'),
//   getPendingPayments
// );

// export default router;

import express from 'express';
import { body } from 'express-validator';
import { protect, authorize } from '../middleware/auth';
import {
  requestLoan,
  getLoans,
  getMyLoans,
  getLoanById,
  signLoan,
  approveLoan,
  disburseLoan,
  requestPayment,
  approvePayment,
  getPendingPayments
} from '../controllers/loan.controller';
import Loan from '../models/Loan';

const router = express.Router();

// ==================== ALL ROUTES REQUIRE AUTHENTICATION ====================
router.use(protect);

// ==================== VALIDATION RULES ====================

const validateLoanRequest = [
  body('principal')
    .notEmpty().withMessage('Principal amount is required')
    .isFloat({ min: 100 }).withMessage('Principal must be at least 100 ETB'),
  
  body('purpose')
    .notEmpty().withMessage('Purpose is required')
    .isIn(['business', 'education', 'medical', 'home', 'debt', 'other']).withMessage('Invalid purpose'),
  
  body('notes')
    .optional()
    .isString().withMessage('Notes must be text')
    .trim()
    .escape()
];

const validatePaymentRequest = [
  body('amount')
    .notEmpty().withMessage('Payment amount is required')
    .isFloat({ min: 1 }).withMessage('Payment must be at least 1 ETB'),
  
  body('paymentMethod')
    .notEmpty().withMessage('Payment method is required')
    .isIn(['cash', 'bank', 'mobile']).withMessage('Invalid payment method'),
  
  body('receiptUrl')
    .optional()
    .isURL().withMessage('Receipt URL must be valid'),
  
  body('notes')
    .optional()
    .isString().withMessage('Notes must be text')
    .trim()
    .escape()
];

const validateApprovePayment = [
  body('paymentIndex')
    .notEmpty().withMessage('Payment index is required')
    .isInt({ min: 0 }).withMessage('Payment index must be a positive number'),
  
  body('approve')
    .notEmpty().withMessage('Approve flag is required')
    .isBoolean().withMessage('Approve must be true or false'),
  
  body('notes')
    .optional()
    .isString().withMessage('Notes must be text')
    .trim()
    .escape()
];

// ==================== TEST ENDPOINT (REMOVE AFTER TESTING) ====================
router.post('/test/advance-days/:id/:days', authorize('super_admin'), async (req, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const daysParam = Array.isArray(req.params.days) ? req.params.days[0] : req.params.days;
    
    const daysNum = parseInt(daysParam);
    
    if (isNaN(daysNum) || daysNum <= 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Days must be a positive number' 
      });
    }
    
    const loan = await Loan.findById(id);
    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan not found' });
    }
    
    if (loan.status !== 'active') {
      return res.status(400).json({ 
        success: false, 
        message: 'Loan must be active to accrue interest' 
      });
    }
    
    const dailyRate = (loan.interestRate / 100) / 30;
    const newInterest = loan.remainingPrincipal * dailyRate * daysNum;
    const roundedInterest = Math.round(newInterest * 100) / 100;
    
    loan.interestAccrued += roundedInterest;
    
    const newDate = new Date(loan.lastInterestCalculation);
    newDate.setDate(newDate.getDate() + daysNum);
    loan.lastInterestCalculation = newDate;
    
    await loan.save();
    
    res.json({
      success: true,
      message: `Advanced ${daysNum} days, added ${roundedInterest.toFixed(2)} interest`,
      data: {
        remainingPrincipal: loan.remainingPrincipal,
        interestAccrued: loan.interestAccrued,
        interestPaid: loan.interestPaid,
        unpaidInterest: loan.interestAccrued - loan.interestPaid
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ==================== PUBLIC ROUTES (Any authenticated user) ====================
router.get('/', getLoans);
router.get('/my', getMyLoans);
router.get('/:id', getLoanById);

// ==================== MEMBER ROUTES ====================
router.post('/request', validateLoanRequest, requestLoan);
router.post('/:id/sign', signLoan);
router.post('/:id/request-payment', validatePaymentRequest, requestPayment);

// ==================== APPROVER ROUTES ====================
router.put('/:id/approve', authorize('approver', 'super_admin'), approveLoan);

// ==================== SUPER ADMIN ROUTES ====================
router.post('/:id/disburse', authorize('super_admin'), disburseLoan);
router.post('/:id/approve-payment', authorize('super_admin'), validateApprovePayment, approvePayment); // 👈 THIS MUST EXIST
router.get('/admin/pending-payments', authorize('super_admin'), getPendingPayments);

export default router;