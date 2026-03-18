import fs from 'fs-extra';
import path from 'path';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';

/**
 * =========================
 * 📁 File Helpers Utility
 * =========================
 * Reusable file operations
 */

export interface FileInfo {
  filename: string;
  path: string;
  size: number;
  mimeType: string;
  originalName: string;
}

/**
 * Ensure directory exists
 */
export const ensureDir = async (dirPath: string): Promise<void> => {
  await fs.ensureDir(dirPath);
};

/**
 * Generate unique filename
 */
export const generateUniqueFilename = (originalName: string): string => {
  const timestamp = Date.now();
  const uuid = uuidv4().split('-')[0];
  const extension = path.extname(originalName);
  const cleanName = path.basename(originalName, extension)
    .replace(/[^a-zA-Z0-9]/g, '-')
    .toLowerCase()
    .substring(0, 30);
  
  return `${cleanName}-${timestamp}-${uuid}${extension}`;
};

/**
 * Validate file type
 */
export const isValidFileType = (
  mimeType: string,
  allowedTypes: string[]
): boolean => {
  return allowedTypes.includes(mimeType);
};

/**
 * Validate file size
 */
export const isValidFileSize = (
  size: number,
  maxSize: number
): boolean => {
  return size <= maxSize;
};

/**
 * Get file info
 */
export const getFileInfo = async (filePath: string): Promise<FileInfo> => {
  const stats = await fs.stat(filePath);
  return {
    filename: path.basename(filePath),
    path: filePath,
    size: stats.size,
    mimeType: '', // Will be set by caller
    originalName: path.basename(filePath)
  };
};

/**
 * Optimize image (reduce size, validate)
 */
export const optimizeImage = async (
  inputPath: string,
  outputPath: string,
  options?: {
    width?: number;
    height?: number;
    quality?: number;
  }
): Promise<void> => {
  const { width = 1200, height = 1200, quality = 80 } = options || {};
  
  await sharp(inputPath)
    .resize(width, height, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .jpeg({ quality })
    .toFile(outputPath);
  
  // Remove original file
  if (inputPath !== outputPath) {
    await fs.remove(inputPath);
  }
};

/**
 * Delete file safely
 */
export const deleteFile = async (filePath: string): Promise<boolean> => {
  try {
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};