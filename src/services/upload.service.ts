import path from 'path';
import fs from 'fs-extra';
import { Request } from 'express';
import {
    ensureDir,
    generateUniqueFilename,
    isValidFileType,
    isValidFileSize,
    optimizeImage,
    deleteFile,
    FileInfo,
    formatFileSize
} from '../fileHelpers';
import ErrorResponse from '../utils/errorResponse';

/**
 * =========================
 * 📤 Upload Service
 * =========================
 * Handles all file upload operations
 */

export interface UploadOptions {
    destination: string;           // Base destination folder
    entityType: 'contribution' | 'loan';
    entityId: string;               // Contribution ID or Loan Number
    allowedTypes?: string[];
    maxSize?: number;               // in bytes
    optimize?: boolean;              // Optimize images?
}

export interface UploadResult {
    success: boolean;
    file: {
        filename: string;
        path: string;
        url: string;
        size: number;
        sizeFormatted: string;
        mimeType: string;
    };
    message?: string;
}

class UploadService {
    private baseUploadDir = path.join(process.cwd(), 'uploads');

    /**
     * Upload a file
     */
    async uploadFile(
        req: Request,
        file: Express.Multer.File,
        options: UploadOptions
    ): Promise<UploadResult> {
        try {
            // Default options
            const allowedTypes = options.allowedTypes || [
                'image/jpeg',
                'image/png',
                'image/jpg',
                'application/pdf'
            ];
            const maxSize = options.maxSize || 5 * 1024 * 1024; // 5MB default

            // Validate file type
            if (!isValidFileType(file.mimetype, allowedTypes)) {
                throw new ErrorResponse(
                    `Invalid file type. Allowed: ${allowedTypes.join(', ')}`,
                    400
                );
            }

            // Validate file size
            if (!isValidFileSize(file.size, maxSize)) {
                throw new ErrorResponse(
                    `File too large. Max size: ${formatFileSize(maxSize)}`,
                    400
                );
            }

            // Determine destination path based on entity type
            const destPath = await this.getDestinationPath(options);
            await ensureDir(destPath);

            // Generate unique filename
            const uniqueFilename = generateUniqueFilename(file.originalname);
            const finalPath = path.join(destPath, uniqueFilename);

            // Move file to destination
            await fs.move(file.path, finalPath);

            // Optimize if it's an image and optimization requested
            if (options.optimize && file.mimetype.startsWith('image/')) {
                const optimizedPath = path.join(destPath, `opt-${uniqueFilename}`);
                await optimizeImage(finalPath, optimizedPath);
                await fs.move(optimizedPath, finalPath, { overwrite: true });
            }

            // Generate URL for accessing file
            const url = this.generateFileUrl(options, uniqueFilename);

            // Get file stats
            const stats = await fs.stat(finalPath);

            return {
                success: true,
                file: {
                    filename: uniqueFilename,
                    path: finalPath,
                    url,
                    size: stats.size,
                    sizeFormatted: formatFileSize(stats.size),
                    mimeType: file.mimetype
                }
            };
        } catch (error) {
            // Clean up temp file if error
            if (file.path && await fs.pathExists(file.path)) {
                await fs.remove(file.path);
            }
            throw error;
        }
    }
  /**
 * Determine destination path based on entity type
 */
private async getDestinationPath(options: UploadOptions): Promise<string> {
  const { entityType, entityId } = options;

  // Ensure entityId is a string (not string[])
  const safeEntityId = Array.isArray(entityId) ? entityId[0] : entityId;

  switch (entityType) {
    case 'contribution':
      // SIMPLIFIED: Just use contribution ID as folder name
      return path.join(
        this.baseUploadDir,
        'contributions',
        safeEntityId
      );

    case 'loan':
      // Use loan number as folder name
      return path.join(
        this.baseUploadDir,
        'loans',
        safeEntityId
      );

    default:
      return path.join(this.baseUploadDir, 'misc');
  }
}
    /**
     * Generate URL for file access
     */
    private generateFileUrl(options: UploadOptions, filename: string): string {
        const { entityType, entityId } = options;

        switch (entityType) {
            case 'contribution':
                const now = new Date();
                const year = now.getFullYear();
                const month = now.getMonth() + 1;
                return `/uploads/contributions/${year}/${month}-*/${filename}`;

            case 'loan':
                return `/uploads/loans/${entityId}/${filename}`;

            default:
                return `/uploads/misc/${filename}`;
        }
    }

    /**
     * Delete file
     */
    async deleteFile(filePath: string): Promise<boolean> {
        return deleteFile(filePath);
    }

    /**
     * Get files for an entity
     */
    async getEntityFiles(
        entityType: 'contribution' | 'loan',
        entityId: string
    ): Promise<FileInfo[]> {
        try {
            const destPath = await this.getDestinationPath({ entityType, entityId, destination: '' });

            if (!await fs.pathExists(destPath)) {
                return [];
            }

            const files = await fs.readdir(destPath);
            const fileInfos: FileInfo[] = [];

            for (const file of files) {
                const filePath = path.join(destPath, file);
                const stats = await fs.stat(filePath);

                if (stats.isFile()) {
                    fileInfos.push({
                        filename: file,
                        path: filePath,
                        size: stats.size,
                        mimeType: this.getMimeType(file),
                        originalName: file
                    });
                }
            }

            return fileInfos;
        } catch (error) {
            console.error('Error getting entity files:', error);
            return [];
        }
    }

    /**
     * Get MIME type from filename
     */
    private getMimeType(filename: string): string {
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes: Record<string, string> = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.pdf': 'application/pdf'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }
}

export default new UploadService();