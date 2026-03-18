import multer from 'multer';
import path from 'path';
import fs from 'fs-extra';
import { Request } from 'express';
import ErrorResponse from '../utils/errorResponse';
import uploadService from '../services/upload.service';

/**
 * =========================
 * 📁 Configure Temporary Storage
 * =========================
 * Files are first uploaded to temp folder
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(process.cwd(), 'uploads', 'temp');
    fs.ensureDirSync(tempDir);
    cb(null, tempDir);
  },

  filename: (req, file, cb) => {
    // Keep original name temporarily, will be renamed later
    cb(null, `temp-${Date.now()}-${file.originalname}`);
  }
});

/**
 * =========================
 * 🔍 File Filter
 * =========================
 */
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ErrorResponse('Only JPEG, PNG and PDF files are allowed', 400));
  }
};

/**
 * =========================
 * 📤 Create Multer Upload Instance
 * =========================
 */
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 5 // Max 5 files per request
  }
});

/**
 * =========================
 * 🎯 Upload Middleware with Context
 * =========================
 * Use this for contribution receipts
 */
export const uploadContributionReceipt = upload.single('receipt');

/**
 * Use this for loan documents
 */
export const uploadLoanDocument = upload.single('document');

/**
 * Use this for multiple files
 */
export const uploadMultiple = upload.array('files', 5);

/**
 * =========================
 * 🧹 Cleanup Temp Files
 * =========================
 * Call this to clean temp folder
 */
export const cleanupTemp = async (): Promise<void> => {
  const tempDir = path.join(process.cwd(), 'uploads', 'temp');
  if (await fs.pathExists(tempDir)) {
    const files = await fs.readdir(tempDir);
    const now = Date.now();
    
    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = await fs.stat(filePath);
      
      // Delete files older than 1 hour
      if (now - stats.ctimeMs > 60 * 60 * 1000) {
        await fs.remove(filePath);
      }
    }
  }
};

// Run cleanup every hour
setInterval(cleanupTemp, 60 * 60 * 1000);