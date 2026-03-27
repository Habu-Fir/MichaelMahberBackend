import { Request, Response, NextFunction } from 'express';
import Loan from '../models/Loan';
import { Transaction } from '../models/Transaction';
import asyncHandler from '../utils/asyncHandler';
import ErrorResponse from '../utils/errorResponse';
import { AuthRequest } from '../middleware/auth';
import dashenClient from '../services/dashenClient';
import { config } from '../config/dashenConfig';
import systemConfigService from '../services/systemConfig.service';

const getDailyRate = (monthlyRate: number): number => {
    return (monthlyRate / 100) / 30;
};

export const initiateDashenPayment = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const { loanId, amount, phoneNumber } = req.body;
    const memberId = req.user?._id;
    const memberName = req.user?.name;

    console.log('\n📱 ===== DASHEN USSD PAYMENT =====');
    console.log(`Loan ID: ${loanId}, Amount: ${amount} ETB, Phone: ${phoneNumber}`);

    if (!loanId || !amount || !phoneNumber) {
        return next(new ErrorResponse('Loan ID, amount, and phone number are required', 400));
    }

    const loan = await Loan.findById(loanId);
    if (!loan) {
        return next(new ErrorResponse('Loan not found', 404));
    }

    if (loan.memberId.toString() !== memberId?.toString()) {
        return next(new ErrorResponse('Not authorized', 403));
    }

    if (loan.status !== 'active') {
        return next(new ErrorResponse(`Loan is not active. Status: ${loan.status}`, 400));
    }

    if (amount <= 0 || amount > loan.remainingPrincipal) {
        return next(new ErrorResponse(`Amount must be between 1 and ${loan.remainingPrincipal} ETB`, 400));
    }

    const orderId = `LOAN-${loan.loanNumber}-${Date.now()}`;

    try {
        const lookupData = await dashenClient.customerLookup(phoneNumber);

        await dashenClient.initiatePayment({
            phoneNumber: phoneNumber,
            creditAccount: config.creditAccount,
            amount: amount.toString(),
            billRefNumber: orderId,
            narrative: `Loan payment for ${loan.loanNumber}`,
            serviceKey: config.serviceKey,
            merchantName: config.merchantName,
            sessionId: lookupData.sessionId,
            callBack: config.callbackURL
        });

        const transaction = new Transaction({
            orderId,
            loanId: loan._id,
            loanNumber: loan.loanNumber,
            memberId: memberId,
            memberName: memberName,
            phoneNumber,
            amount,
            sessionId: lookupData.sessionId,
            status: 'processing'
        });
        await transaction.save();

        loan.pendingPayments.push({
            amount,
            paymentMethod: 'dashen_ussd',
            requestedAt: new Date(),
            status: 'pending',
            dashenOrderId: orderId,
            phoneNumber: phoneNumber,
            transactionId: undefined
        });
        loan.status = 'payment_pending';
        await loan.save();

        res.status(200).json({
            success: true,
            message: 'USSD payment request sent. Check your phone and enter PIN to complete payment.',
            data: { orderId, amount, phoneNumber, transactionId: transaction._id }
        });

    } catch (error: any) {
        console.error('❌ Dashen payment error:', error);
        return next(new ErrorResponse(error.message || 'Failed to initiate USSD payment', 500));
    }
});

export const dashenPaymentCallback = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.log('\n🔔 ===== DASHEN CALLBACK =====');
    console.log('Callback:', JSON.stringify(req.body, null, 2));

    const callbackData = req.body;
    const transactionData = callbackData.data;
    const transactionStatus = transactionData.transaction_status;
    const billReference = transactionData.billReference;
    const ftNumber = transactionData.ftNumber;

    const transaction = await Transaction.findOne({ orderId: billReference });
    if (!transaction) {
        console.log(`❌ Transaction not found: ${billReference}`);
        res.status(200).json({ status: 'success' });
        return;
    }

    const loan = await Loan.findById(transaction.loanId);
    if (!loan) {
        console.log(`❌ Loan not found: ${transaction.loanId}`);
        res.status(200).json({ status: 'success' });
        return;
    }

    const paymentIndex = loan.pendingPayments.findIndex(
        (p: any) => p.dashenOrderId === billReference && p.status === 'pending'
    );

    if (paymentIndex === -1) {
        console.log(`❌ Pending payment not found`);
        res.status(200).json({ status: 'success' });
        return;
    }

    const pendingPayment = loan.pendingPayments[paymentIndex];

    if (transactionStatus === 'PAID') {
        console.log(`✅ Payment successful for loan ${loan.loanNumber}`);

        const dailyRate = getDailyRate(loan.interestRate);
        const now = new Date();
        const lastCalc = loan.lastInterestCalculation || loan.disbursementDate || loan.requestDate;
        const daysDiff = Math.floor((now.getTime() - lastCalc.getTime()) / (1000 * 60 * 60 * 24));

        let newInterest = 0;
        if (daysDiff > 0) {
            newInterest = loan.remainingPrincipal * dailyRate * daysDiff;
            newInterest = Math.round(newInterest * 100) / 100;
        }

        loan.interestAccrued += newInterest;
        loan.lastInterestCalculation = now;

        const unpaidInterest = loan.interestAccrued - loan.interestPaid;
        let interestPortion = 0, principalPortion = 0;

        if (unpaidInterest > 0) {
            if (pendingPayment.amount <= unpaidInterest) {
                interestPortion = pendingPayment.amount;
            } else {
                interestPortion = unpaidInterest;
                principalPortion = pendingPayment.amount - unpaidInterest;
            }
        } else {
            principalPortion = pendingPayment.amount;
        }

        loan.interestPaid += interestPortion;
        loan.amountPaid += pendingPayment.amount;
        loan.remainingPrincipal -= principalPortion;
        if (loan.remainingPrincipal < 0) loan.remainingPrincipal = 0;

        loan.paymentHistory.push({
            amount: pendingPayment.amount,
            principalPortion,
            interestPortion,
            date: now,
            paymentMethod: 'dashen_ussd',
            receiptUrl: ftNumber,
            notes: `Paid via Dashen USSD. Ref: ${ftNumber}`,
            approvedBy: undefined,
            approvedAt: now
        });

        pendingPayment.status = 'approved';
        pendingPayment.reviewedAt = now;
        pendingPayment.transactionId = ftNumber;
        pendingPayment.reviewNotes = `Payment completed. Reference: ${ftNumber}`;

        if (interestPortion > 0) {
            await systemConfigService.updateInterest(interestPortion);
        }

        const remainingUnpaidInterest = loan.interestAccrued - loan.interestPaid;
        if (loan.remainingPrincipal <= 0 && remainingUnpaidInterest <= 0.01) {
            loan.status = 'completed';
            loan.completedDate = now;
        } else {
            loan.status = 'active';
        }

        await loan.save();

        // Update transaction manually instead of using non-existent methods
        transaction.status = 'paid';
        transaction.ftNumber = ftNumber;
        transaction.callbackData = callbackData;
        transaction.callbackReceived = true;
        transaction.completedAt = new Date();
        transaction.statusMessage = 'Payment successful';
        await transaction.save();

        console.log(`✅ Loan ${loan.loanNumber} updated successfully`);

    } else {
        pendingPayment.status = 'rejected';
        pendingPayment.reviewedAt = new Date();
        pendingPayment.reviewNotes = `Payment ${transactionStatus}`;

        const hasOtherPending = loan.pendingPayments.some((p: any) => p.status === 'pending');
        if (!hasOtherPending) loan.status = 'active';

        await loan.save();

        // Update transaction manually instead of using non-existent methods
        transaction.status = 'failed';
        transaction.callbackData = callbackData;
        transaction.callbackReceived = true;
        transaction.completedAt = new Date();
        transaction.statusMessage = `Payment ${transactionStatus}`;
        await transaction.save();

        console.log(`❌ Payment ${transactionStatus} for loan ${loan.loanNumber}`);
    }

    res.status(200).json({ status: 'success', message: 'Callback processed' });
});

export const checkDashenPaymentStatus = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const { orderId } = req.params;

    const transaction = await Transaction.findOne({ orderId });
    if (!transaction) {
        return next(new ErrorResponse('Payment not found', 404));
    }

    res.status(200).json({
        success: true,
        data: {
            orderId: transaction.orderId,
            amount: transaction.amount,
            status: transaction.status,
            ftNumber: transaction.ftNumber,
            createdAt: transaction.createdAt
        }
    });
});