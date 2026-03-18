import express from 'express';
import { body } from 'express-validator';
import { protect, authorize } from '../middleware/auth';
import {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  resetPassword,
  getUserStats
} from '../controllers/user.controller';

const router = express.Router();

/**
 * =========================
 * ✅ Validation Rules
 * =========================
 */
const validateUserCreate = [
  body('name')
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),
  
  body('phone')
    .notEmpty().withMessage('Phone number is required')
    .matches(/^\+?[\d\s-]{10,}$/).withMessage('Please provide a valid phone number'),
  
  body('address')
    .notEmpty().withMessage('Address is required')
    .isLength({ max: 200 }).withMessage('Address cannot exceed 200 characters'),
  
  body('role')
    .optional()
    .isIn(['member', 'approver', 'admin']).withMessage('Invalid role')
];

const validateUserUpdate = [
  body('name')
    .optional()
    .isLength({ min: 2, max: 50 }).withMessage('Name must be between 2 and 50 characters'),
  
  body('phone')
    .optional()
    .matches(/^\+?[\d\s-]{10,}$/).withMessage('Please provide a valid phone number'),
  
  body('address')
    .optional()
    .isLength({ max: 200 }).withMessage('Address cannot exceed 200 characters'),
  
  body('role')
    .optional()
    .isIn(['member', 'approver', 'admin']).withMessage('Invalid role'),
  
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be a boolean')
];

/**
 * =========================
 * 🚦 User Routes
 * =========================
 * All routes require authentication and super_admin role
 */
router.use(protect);
router.use(authorize('super_admin'));

// Statistics route (specific before /:id)
router.get('/stats', getUserStats);

// CRUD routes
router.route('/')
  .get(getUsers)
  .post(validateUserCreate, createUser);

router.route('/:id')
  .get(getUser)
  .put(validateUserUpdate, updateUser)
  .delete(deleteUser);

// Password reset
router.post('/:id/reset-password', resetPassword);

export default router;