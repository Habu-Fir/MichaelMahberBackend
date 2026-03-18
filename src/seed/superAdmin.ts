import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../models/User'; // adjust path if needed

// Load environment variables
dotenv.config();

const seedSuperAdmin = async () => {
  try {
    console.log('🚀 Seeding Super Admin...\n');

    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in .env');
    }

    // Connect to MongoDB
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB Connected\n');

    const email = 'super@mahber.com';

    // Check if already exists
    const existing = await User.findOne({ email });

    if (existing) {
      console.log('⚠️ Super Admin already exists.');
      await mongoose.disconnect();
      process.exit(0);
    }

    // IMPORTANT:
    // If your User model already hashes password in pre('save'),
    // DO NOT hash manually.
    // If not, uncomment bcrypt below.

    // const hashedPassword = await bcrypt.hash('SuperAdmin123!', 10);

    const superAdmin = await User.create({
      name: 'Super Admin',
      email,
      password: 'SuperAdmin123!', // will be hashed by schema middleware
      phone: '+1234567890',
      address: 'Admin Office',
      role: 'super_admin',
      isActive: true,
      isFirstLogin: false,
      joinedDate: new Date()
    });

    console.log('🎉 Super Admin Created Successfully!\n');
    console.log('Email: super@mahber.com');
    console.log('Password: SuperAdmin123!');
    console.log('\n⚠️ Please change password after first login.\n');

    await mongoose.disconnect();
    console.log('🔌 MongoDB Disconnected');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating Super Admin:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedSuperAdmin();