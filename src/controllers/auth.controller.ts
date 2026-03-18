import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';
import User from '../models/User';
import { generateToken } from '../utils/generateToken';
import asyncHandler from '../utils/asyncHandler';
import ErrorResponse from '../utils/errorResponse';

// Extend Request type to include user (set by auth middleware)
interface AuthRequest extends Request {
  user?: any;
}

/**
 * =========================
 * 🔑 Login Controller
 * =========================
 * @route   POST /api/auth/login
 * @access  Public
 */
export const login = asyncHandler(async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Check validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { email, password } = req.body;

  // Find user by email (include password field)
  const user = await User.findOne({ email }).select('+password');

  // User not found
  if (!user) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  // Check if account is active
  if (!user.isActive) {
    return next(new ErrorResponse(
      'Your account has been deactivated. Please contact administrator.',
      401
    ));
  }

  // Verify password using our model method
  const isPasswordMatch = await user.comparePassword(password);

  if (!isPasswordMatch) {
    return next(new ErrorResponse('Invalid credentials', 401));
  }

  // Check if this is first login (for redirecting to change password)
  const isFirstLogin = user.isFirstLogin;

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Generate token
  const token = generateToken(user._id.toString());

  res.status(200).json({
    success: true,
    token,
    isFirstLogin,  // Send this flag to frontend
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      address: user.address,
      isFirstLogin: user.isFirstLogin,
      profilePicture: user.profilePicture
    }
  });
});

/**
 * =========================
 * 🔐 Change Password
 * =========================
 * @route   POST /api/auth/change-password
 * @access  Private
 */
export const changePassword = asyncHandler(async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const { currentPassword, newPassword } = req.body;

  // Validation
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  // Get user with password field
  const user = await User.findById(req.user._id).select('+password');

  if (!user) {
    return next(new ErrorResponse('User not found', 404));
  }

  // Verify current password
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    return next(new ErrorResponse('Current password is incorrect', 401));
  }

  // Ensure new password is different
  if (currentPassword === newPassword) {
    return next(new ErrorResponse('New password must be different from current password', 400));
  }

  // Update password
  user.password = newPassword;  // Will be hashed by pre-save middleware
  user.isFirstLogin = false;    // Mark that they've changed password
  user.passwordChangedAt = new Date();

  await user.save();

  // Generate new token
  const token = generateToken(user._id.toString());

  res.status(200).json({
    success: true,
    message: 'Password changed successfully',
    token  // Send new token
  });
});

/**
 * =========================
 * 👤 Get Current User
 * =========================
 * @route   GET /api/auth/me
 * @access  Private (requires token)
 */
export const getMe = asyncHandler(async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  // User is already attached by auth middleware
  const user = await User.findById(req.user._id).select('-password');

  res.status(200).json({
    success: true,
    data: user
  });
});

/**
 * =========================
 * 🚪 Logout Controller
 * =========================
 * @route   GET /api/auth/logout
 * @access  Private
 */
export const logout = asyncHandler(async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // With JWT, server just acknowledges logout
  // Client removes the token
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});