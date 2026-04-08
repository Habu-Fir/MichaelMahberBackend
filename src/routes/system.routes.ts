import { Router } from 'express';
import { authorize, protect } from '../middleware/auth';
import systemConfigService from '../services/systemConfig.service';
import asyncHandler from '../utils/asyncHandler';

const router = Router();

// Get system financial summary (all authenticated users)
router.get('/financial-summary', protect, asyncHandler(async (req: { user: { email: any; }; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { success: boolean; data: { totalContributions: number; totalInterest: number; totalAvailable: number; }; }): void; new(): any; }; }; }) => {
    console.log('📊 Financial summary endpoint called by:', req.user?.email);

    const config = await systemConfigService.getConfig();

    res.status(200).json({
        success: true,
        data: {
            totalContributions: config.totalContributions,
            totalInterest: config.totalInterest,
            totalAvailable: config.totalAvailable
        }
    });
}));

// Get total available for loans
router.get('/available-funds', protect, asyncHandler(async (req: { user: { email: any; }; }, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { success: boolean; data: { totalAvailable: number; }; }): void; new(): any; }; }; }) => {
    console.log('💰 Available funds endpoint called by:', req.user?.email);

    const totalAvailable = await systemConfigService.getTotalAvailable();

    res.status(200).json({
        success: true,
        data: {
            totalAvailable
        }
    });
}));

// Add this to system.routes.ts
import { updateDailyInterest } from '../jobs/updateDailyInterest';

// Manual trigger for interest update (Super Admin only)
router.post('/update-interest', authorize('super_admin'), asyncHandler(async (_req: any, res: { status: (arg0: number) => { (): any; new(): any; json: { (arg0: { success: boolean; message: string; }): void; new(): any; }; }; }) => {
    await updateDailyInterest();
    res.status(200).json({
        success: true,
        message: 'Interest update triggered successfully'
    });
}));

export default router;