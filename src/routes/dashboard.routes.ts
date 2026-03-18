import express from 'express';
import { protect, authorize } from '../middleware/auth';
import {
    getDashboard,
    getSuperAdminDashboard,
    getApproverDashboard,
    getMemberDashboard
} from '../controllers/dashboard.controller';

const router = express.Router();

// All dashboard routes require authentication
router.use(protect);

/**
 * @route   GET /api/dashboard
 * @desc    Get dashboard based on user role
 * @access  Private
 */
router.get('/', getDashboard);

/**
 * @route   GET /api/dashboard/super-admin
 * @desc    Super Admin dashboard (full overview)
 * @access  Private (Super Admin only)
 */
router.get('/super-admin', authorize('super_admin'), getSuperAdminDashboard);

/**
 * @route   GET /api/dashboard/approver
 * @desc    Approver dashboard (loans ready for approval)
 * @access  Private (Approver only)
 */
router.get('/approver', authorize('approver', 'super_admin'), getApproverDashboard);

/**
 * @route   GET /api/dashboard/member
 * @desc    Member dashboard (my loans, my contributions)
 * @access  Private
 */
router.get('/member', getMemberDashboard);

export default router;