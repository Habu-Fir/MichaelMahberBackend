import { Types } from 'mongoose';

/**
 * =========================
 * 🔐 User Role Type
 * =========================
 * Defines all possible user roles in the system
 */
export type UserRole =
    | 'super_admin'    // Full system control
    | 'admin'          // Can manage members
    | 'approver'       // Can approve loans
    | 'member';        // Regular user

/**
 * =========================
 * 📄 Base User Properties
 * =========================
 */
export interface IUser {
    _id: Types.ObjectId;
    name: string;
    email: string;
    password: string;
    phone: string;
    address: string;
    role: UserRole;
    profilePicture?: string | null;
    isActive: boolean;
    joinedDate: Date;
    lastLogin?: Date;

    // NEW FIELDS for Super Admin flow
    passwordChangedAt?: Date;     // When password was last changed
    isFirstLogin: boolean;        // Force password change on first login
    createdBy?: Types.ObjectId;   // Which admin created this user

    // Timestamps (auto-added by Mongoose)
    createdAt: Date;
    updatedAt: Date;
}

/**
 * =========================
 * ⚙️ Instance Methods
 * =========================
 */
export interface IUserMethods {
    comparePassword(enteredPassword: string): Promise<boolean>;
}