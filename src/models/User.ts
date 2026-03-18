import mongoose, { Schema, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser, IUserMethods } from './IUser';

/**
 * =========================
 * 🏗 Model Type Definition
 * =========================
 */
type UserModel = Model<IUser, {}, IUserMethods>;

/**
 * =========================
 * 📄 User Schema
 * =========================
 */
const UserSchema = new Schema<IUser, UserModel, IUserMethods>(
    {
        name: {
            type: String,
            required: [true, 'Please add a name'],
            trim: true,
            maxlength: [50, 'Name cannot be more than 50 characters']
        },

        email: {
            type: String,
            required: [true, 'Please add an email'],
            unique: true,
            lowercase: true,
            match: [
                /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
                'Please add a valid email'
            ]
        },

        password: {
            type: String,
            required: [true, 'Please add a password'],
            minlength: 6,
            select: false,
            validate: {
                validator: function (value: string) {
                    const hasUpperCase = /[A-Z]/.test(value);
                    const hasLowerCase = /[a-z]/.test(value);
                    const hasNumber = /\d/.test(value);
                    return (
                        value.length >= 6 &&
                        hasUpperCase &&
                        hasLowerCase &&
                        hasNumber
                    );
                },
                message:
                    'Password must be at least 6 characters and contain uppercase, lowercase, and number'
            }
        },

        phone: {
            type: String,
            required: [true, 'Please add a phone number']
        },

        address: {
            type: String,
            required: [true, 'Please add your address']
        },

        role: {
            type: String,
            enum: ['super_admin', 'admin', 'approver', 'member'],
            default: 'member'
        },

        profilePicture: {
            type: String,
            default: null
        },

        isActive: {
            type: Boolean,
            default: true
        },

        joinedDate: {
            type: Date,
            default: Date.now
        },

        lastLogin: {
            type: Date
        },
        passwordChangedAt: {
            type: Date
        },

        isFirstLogin: {
            type: Boolean,
            default: true  // New users must change password on first login
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: function (this: any) {
                return this.role !== 'super_admin';
            }
        }
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    },

);

/**
 * =========================
 * 🔐 Password Hash Middleware
 * =========================
 * Runs BEFORE saving a user document
 * Only hashes password if it was modified
 */
UserSchema.pre('save', async function () {
    if (!this.isModified('password')) return;

    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
});

/**
 * =========================
 * 🔑 Compare Password Method
 * =========================
 * Instance method to check if entered password matches
 * the stored hash
 */

UserSchema.methods.comparePassword = async function (
    enteredPassword: string
): Promise<boolean> {
    return bcrypt.compare(enteredPassword, this.password);
};

/**
 * =========================
 * 🔍 Virtual Field
 * =========================
 */
UserSchema.virtual('fullName').get(function () {
    return this.name;
});

/**
 * =========================
 * 🚀 Export Model
 * =========================
 */
const User = mongoose.model<IUser, UserModel>('User', UserSchema);

export default User;