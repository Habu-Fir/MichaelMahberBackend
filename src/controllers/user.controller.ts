import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import asyncHandler from '../utils/asyncHandler';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../middleware/auth';
import { Document } from 'mongoose';
import { IUser, IUserMethods } from '../models/IUser';

// Helper type for user with methods
type UserDocument = Document<unknown, {}, IUser> & IUser & Required<{ _id: string; }> & IUserMethods;

// Helper function to cast user to correct type
const toUserDocument = (user: any): UserDocument => {
    return user as UserDocument;
};




/**
 * =========================
 * 📝 Generate Temporary Password
 * =========================
 * Creates a secure random password
 * Format: 8 chars + 2 uppercase + 2 numbers
 */
const generateTemporaryPassword = (): string => {
    const lowercase = Math.random().toString(36).slice(-8);
    const uppercase = Math.random().toString(36).toUpperCase().slice(-2);
    const numbers = Math.floor(Math.random() * 90 + 10).toString(); // 10-99
    return lowercase + uppercase + numbers;
};

/**
 * =========================
 * 👑 Create User (Super Admin Only)
 * =========================
 * @route   POST /api/users
 * @access  Private/SuperAdmin
 */
export const createUser = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const { name, email, phone, address, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return next(new ErrorResponse('Email already exists', 400));
    }

    // Generate temporary password
    const tempPassword = generateTemporaryPassword();

    // Create user (createdBy is the current admin)
    const user = await User.create({
        name,
        email,
        password: tempPassword,
        phone,
        address,
        role: role || 'member',
        isFirstLogin: true,
        createdBy: req.user?._id
    });

    // Return user data with temporary password (ONLY SHOWN ONCE!)
    res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: {
            id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            phone: user.phone,
            address: user.address,
            temporaryPassword: tempPassword, // Admin must share this securely
            isFirstLogin: user.isFirstLogin
        }
    });
});

/**
 * =========================
 * 📋 Get All Users (Paginated)
 * =========================
 * @route   GET /api/users
 * @access  Private/SuperAdmin
 */
export const getUsers = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    // Pagination parameters
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Filtering
    const filter: any = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.isActive) filter.isActive = req.query.isActive === 'true';
    if (req.query.search) {
        filter.$or = [
            { name: { $regex: req.query.search, $options: 'i' } },
            { email: { $regex: req.query.search, $options: 'i' } }
        ];
    }

    // Get total count for pagination
    const total = await User.countDocuments(filter);

    // Get users with creator info
    const users = await User.find(filter)
        .select('-password')
        .populate('createdBy', 'name email')
        .skip(skip)
        .limit(limit)
        .sort('-createdAt');

    res.status(200).json({
        success: true,
        count: users.length,
        total,
        page,
        pages: Math.ceil(total / limit),
        data: users
    });
});

/**
 * =========================
 👤 Get Single User
 * =========================
 * @route   GET /api/users/:id
 * @access  Private/SuperAdmin
 */
export const getUser = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const user = await User.findById(req.params.id)
        .select('-password')
        .populate('createdBy', 'name email');

    if (!user) {
        return next(new ErrorResponse('User not found', 404));
    }

    res.status(200).json({
        success: true,
        data: user
    });
});

/**
 * =========================
 * ✏️ Update User
 * =========================
 * @route   PUT /api/users/:id
 * @access  Private/SuperAdmin
 */
export const updateUser = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    let user = await User.findById(req.params.id);

    if (!user) {
        return next(new ErrorResponse('User not found', 404));
    }

    // Prevent super_admin from being modified by anyone (including themselves)
    if (user.role === 'super_admin' && req.user?._id.toString() !== user._id.toString()) {
        return next(new ErrorResponse('Cannot modify super admin', 403));
    }

    // Fields that can be updated
    const fieldsToUpdate: any = {};
    const allowedFields = ['name', 'phone', 'address', 'role', 'isActive'];

    allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
            fieldsToUpdate[field] = req.body[field];
        }
    });

    const updatedUser = await User.findByIdAndUpdate(
        req.params.id,
        fieldsToUpdate,
        { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
        return next(new ErrorResponse('User not found after update', 404));
    }

    res.status(200).json({
        success: true,
        data: toUserDocument(updatedUser)
    });
});




/**
 * =========================
 * 🔄 Reset User Password
 * =========================
 * @route   POST /api/users/:id/reset-password
 * @access  Private/SuperAdmin
 */
export const resetPassword = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const user = await User.findById(req.params.id).select('+password');

    if (!user) {
        return next(new ErrorResponse('User not found', 404));
    }

    // Generate new temporary password
    const tempPassword = generateTemporaryPassword();

    // Update password and force change on next login
    user.password = tempPassword;
    user.isFirstLogin = true;
    user.passwordChangedAt = new Date();

    await user.save();

    res.status(200).json({
        success: true,
        message: 'Password reset successfully',
        data: {
            email: user.email,
            temporaryPassword: tempPassword // Only shown once!
        }
    });
});

/**
 * =========================
 * ❌ Delete User
 * =========================
 * @route   DELETE /api/users/:id
 * @access  Private/SuperAdmin
 */
export const deleteUser = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const user = await User.findById(req.params.id);

    if (!user) {
        return next(new ErrorResponse('User not found', 404));
    }

    // Prevent deleting super_admin
    if (user.role === 'super_admin') {
        return next(new ErrorResponse('Cannot delete super admin', 403));
    }

    // Soft delete - just deactivate
    user.isActive = false;
    await user.save();

    res.status(200).json({
        success: true,
        message: 'User deactivated successfully'
    });
});

/**
 * =========================
 * 📊 Get User Statistics
 * =========================
 * @route   GET /api/users/stats
 * @access  Private/SuperAdmin
 */
export const getUserStats = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const stats = await User.aggregate([
        {
            $group: {
                _id: '$role',
                count: { $sum: 1 },
                active: {
                    $sum: { $cond: ['$isActive', 1, 0] }
                },
                inactive: {
                    $sum: { $cond: ['$isActive', 0, 1] }
                }
            }
        }
    ]);

    const total = await User.countDocuments();

    res.status(200).json({
        success: true,
        data: {
            total,
            byRole: stats
        }
    });
});