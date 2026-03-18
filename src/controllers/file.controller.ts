import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs-extra';
import asyncHandler from '../utils/asyncHandler';
import ErrorResponse from '../utils/errorResponse';
import uploadService from '../services/upload.service';
import { AuthRequest } from '../middleware/auth';

/**
 * =========================
 * 📤 Upload Contribution Receipt
 * =========================
 * @route   POST /api/files/contributions/:id/receipt
 * @access  Private
 */
export const uploadContributionReceipt = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    if (!req.file) {
        return next(new ErrorResponse('Please upload a file', 400));
    }

    // Ensure id is a string
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const result = await uploadService.uploadFile(req, req.file, {
        destination: 'contributions',
        entityType: 'contribution',
        entityId: id,
        optimize: true
    });

    res.status(200).json({
        success: true,
        message: 'File uploaded successfully',
        data: result.file
    });
});

/**
 * =========================
 * 📤 Upload Loan Document
 * =========================
 * @route   POST /api/files/loans/:loanNumber/document
 * @access  Private/SuperAdmin
 */
export const uploadLoanDocument = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    if (!req.file) {
        return next(new ErrorResponse('Please upload a file', 400));
    }

    // Ensure loanNumber is a string
    const loanNumber = Array.isArray(req.params.loanNumber)
        ? req.params.loanNumber[0]
        : req.params.loanNumber;

    const result = await uploadService.uploadFile(req, req.file, {
        destination: 'loans',
        entityType: 'loan',
        entityId: loanNumber,
        optimize: true
    });

    res.status(200).json({
        success: true,
        message: 'Loan document uploaded successfully',
        data: result.file
    });
});

/**
 * =========================
 * 📋 Get Entity Files
 * =========================
 * @route   GET /api/files/:entityType/:entityId
 * @access  Private
 */
export const getEntityFiles = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    // Ensure params are strings
    const entityType = Array.isArray(req.params.entityType)
        ? req.params.entityType[0]
        : req.params.entityType;

    const entityId = Array.isArray(req.params.entityId)
        ? req.params.entityId[0]
        : req.params.entityId;

    if (!['contribution', 'loan'].includes(entityType)) {
        return next(new ErrorResponse('Invalid entity type', 400));
    }

    const files = await uploadService.getEntityFiles(
        entityType as 'contribution' | 'loan',
        entityId
    );

    res.status(200).json({
        success: true,
        count: files.length,
        data: files
    });
});

/**
 * =========================
 * ❌ Delete File
 * =========================
 * @route   DELETE /api/files/:entityType/:entityId/:filename
 * @access  Private/SuperAdmin
 */
export const deleteEntityFile = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    // Ensure params are strings
    const entityType = Array.isArray(req.params.entityType)
        ? req.params.entityType[0]
        : req.params.entityType;

    const entityId = Array.isArray(req.params.entityId)
        ? req.params.entityId[0]
        : req.params.entityId;

    const filename = Array.isArray(req.params.filename)
        ? req.params.filename[0]
        : req.params.filename;

    if (!['contribution', 'loan'].includes(entityType)) {
        return next(new ErrorResponse('Invalid entity type', 400));
    }

    // SIMPLIFIED: Just use entityId as the subfolder name
    const baseDir = path.join(process.cwd(), 'uploads', entityType + 's');
    const filePath = path.join(baseDir, entityId, filename);

    const deleted = await uploadService.deleteFile(filePath);

    if (!deleted) {
        return next(new ErrorResponse('File not found', 404));
    }

    res.status(200).json({
        success: true,
        message: 'File deleted successfully'
    });
});