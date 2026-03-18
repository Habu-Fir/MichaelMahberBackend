import express from 'express';
import { body } from 'express-validator';
import { protect, authorize } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
    generateMonthlyContributions,
    uploadReceipt,
    verifyContribution,
    getContributions,
    getMyContributions,
    getContributionSummary
} from '../controllers/contribution.controller';

const router = express.Router();

/**
 * =========================
 * ✅ Validation Rules
 * =========================
 */
const validateGenerate = [
    body('month')
        .isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
    body('year')
        .isInt({ min: 2024 }).withMessage('Year must be 2024 or later')
];

/**
 * =========================
 * 🚦 Public Routes (All Authenticated Users)
 * =========================
 */
router.use(protect); // All routes require authentication

// Get current user's contributions
router.get('/my', getMyContributions);

/**
 * =========================
 * 👑 Admin & Super Admin Routes
 * =========================
 */
// Generate monthly contributions
router.post(
    '/generate',
    authorize('admin', 'super_admin'),
    validateGenerate,
    generateMonthlyContributions
);

// Get all contributions (with filters)
router.get('/', authorize('admin', 'super_admin'), getContributions);

// Get summary statistics
router.get('/summary', authorize('admin', 'super_admin'), getContributionSummary);

/**
 * =========================
 * 🔒 Member Routes (with ownership checks)
 * =========================
 */
// Upload receipt (member must own the contribution)
router.post(
    '/:id/receipt',
    upload.single('receipt'),
    uploadReceipt
);

/**
 * =========================
 * ⭐ Super Admin Only Routes
 * =========================
 */
// Verify contribution
router.put(
    '/:id/verify',
    authorize('super_admin'),
    verifyContribution
);

export default router;