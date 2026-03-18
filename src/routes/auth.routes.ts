import express from 'express';
import { body } from 'express-validator';
import {
  login,
  changePassword,
  getMe,
  logout
} from '../controllers/auth.controller';
import { protect } from '../middleware/auth';

const router = express.Router();

/**
 * =========================
 * ✅ Login Validation Rules
 * =========================
 */
const validateLogin = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
];

/**
 * =========================
 * ✅ Password Change Validation
 * =========================
 */
const validatePasswordChange = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required'),

  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
];

/**
 * =========================
 * 🚦 Public Routes
 * =========================
 * No authentication required
 */
router.post('/login', validateLogin, login);

/**
 * =========================
 * 🔒 Protected Routes
 * =========================
 * Require valid JWT token
 */
router.post('/change-password', protect, validatePasswordChange, changePassword);
router.get('/me', protect, getMe);
router.get('/logout', protect, logout);

// ❌ NO REGISTER ROUTE - Users are created only by Super Admin

export default router;