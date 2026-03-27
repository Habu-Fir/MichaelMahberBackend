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

// Generate a unique 10-digit numeric billRefNumber
const generateBillRefNumber = (): string => {
    // Use timestamp last 10 digits
    const timestamp = Date.now().toString();
    return timestamp.slice(-10); // Always returns 10 digits
    // Example: 1734567890
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

    // Generate a unique 10-digit numeric billRefNumber
    const orderId = generateBillRefNumber();
    console.log('📝 Generated 10-digit billRefNumber:', orderId);

    try {
        // Step 1: Customer Lookup
        console.log('📞 Looking up customer...');
        const lookupData = await dashenClient.customerLookup(phoneNumber);
        console.log('✅ Customer found:', lookupData.name);

        // Step 2: Initiate Payment with 10-digit billRefNumber
        console.log('💰 Initiating payment...');
        await dashenClient.initiatePayment({
            phoneNumber: phoneNumber,
            creditAccount: config.creditAccount,
            amount: amount.toString(),
            billRefNumber: orderId,  // Now using 10-digit numeric ID
            narrative: `Loan payment for ${loan.loanNumber}`,
            serviceKey: config.serviceKey,
            merchantName: config.merchantName,
            sessionId: lookupData.sessionId,
            callBack: config.callbackURL
        });
        console.log('✅ Payment initiated successfully');

        // Step 3: Save transaction record
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
        console.log('✅ Transaction saved:', transaction._id);

        // Step 4: Add to loan pending payments
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
        console.log('✅ Loan updated with pending payment');

        res.status(200).json({
            success: true,
            message: 'USSD payment request sent. Check your phone and enter PIN to complete payment.',
            data: {
                orderId,
                amount,
                phoneNumber,
                transactionId: transaction._id
            }
        });

    } catch (error: any) {
        console.error('❌ Dashen payment error:', error);
        console.error('Error details:', error.response?.data || error.message);
        return next(new ErrorResponse(error.message || 'Failed to initiate USSD payment', 500));
    }
});

export const dashenPaymentCallback = asyncHandler(async (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.log('\n🔔 ===== DASHEN CALLBACK =====');
    console.log('Callback received at:', new Date().toISOString());
    console.log('Callback data:', JSON.stringify(req.body, null, 2));

    const callbackData = req.body;
    const transactionData = callbackData.data;
    const transactionStatus = transactionData.transaction_status;
    const billReference = transactionData.billReference;
    const ftNumber = transactionData.ftNumber;

    console.log(`Bill Reference: ${billReference}, Status: ${transactionStatus}, FT Number: ${ftNumber}`);

    // Find transaction by orderId
    const transaction = await Transaction.findOne({ orderId: billReference });
    if (!transaction) {
        console.log(`❌ Transaction not found for orderId: ${billReference}`);
        res.status(200).json({ status: 'success', message: 'Callback received' });
        return;
    }

    console.log(`✅ Transaction found: ${transaction._id}, Loan: ${transaction.loanNumber}`);

    // Find the loan
    const loan = await Loan.findById(transaction.loanId);
    if (!loan) {
        console.log(`❌ Loan not found: ${transaction.loanId}`);
        res.status(200).json({ status: 'success', message: 'Callback received' });
        return;
    }

    // Find the pending payment
    const paymentIndex = loan.pendingPayments.findIndex(
        (p: any) => p.dashenOrderId === billReference && p.status === 'pending'
    );

    if (paymentIndex === -1) {
        console.log(`❌ Pending payment not found for orderId: ${billReference}`);
        res.status(200).json({ status: 'success', message: 'Callback received' });
        return;
    }

    const pendingPayment = loan.pendingPayments[paymentIndex];
    console.log(`✅ Pending payment found: ${pendingPayment.amount} ETB`);

    if (transactionStatus === 'PAID') {
        console.log(`✅ Payment successful for loan ${loan.loanNumber}`);

        // Calculate interest
        const dailyRate = getDailyRate(loan.interestRate);
        const now = new Date();
        const lastCalc = loan.lastInterestCalculation || loan.disbursementDate || loan.requestDate;
        const daysDiff = Math.floor((now.getTime() - lastCalc.getTime()) / (1000 * 60 * 60 * 24));

        let newInterest = 0;
        if (daysDiff > 0) {
            newInterest = loan.remainingPrincipal * dailyRate * daysDiff;
            newInterest = Math.round(newInterest * 100) / 100;
            console.log(`💰 Interest accrued: ${newInterest} ETB over ${daysDiff} days`);
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

        console.log(`💰 Payment split - Principal: ${principalPortion}, Interest: ${interestPortion}`);

        // Update loan amounts
        loan.interestPaid += interestPortion;
        loan.amountPaid += pendingPayment.amount;
        loan.remainingPrincipal -= principalPortion;
        if (loan.remainingPrincipal < 0) loan.remainingPrincipal = 0;

        // Add to payment history
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

        // Update pending payment status
        pendingPayment.status = 'approved';
        pendingPayment.reviewedAt = now;
        pendingPayment.transactionId = ftNumber;
        pendingPayment.reviewNotes = `Payment completed. Reference: ${ftNumber}`;

        // Update interest in system config
        if (interestPortion > 0) {
            await systemConfigService.updateInterest(interestPortion);
        }

        // Check if loan is completed
        const remainingUnpaidInterest = loan.interestAccrued - loan.interestPaid;
        if (loan.remainingPrincipal <= 0 && remainingUnpaidInterest <= 0.01) {
            loan.status = 'completed';
            loan.completedDate = now;
            console.log(`🏁 Loan ${loan.loanNumber} completed!`);
        } else {
            loan.status = 'active';
            console.log(`📊 Loan ${loan.loanNumber} remaining: ${loan.remainingPrincipal} ETB`);
        }

        await loan.save();
        console.log(`✅ Loan ${loan.loanNumber} saved`);

        // Update transaction
        transaction.status = 'paid';
        transaction.ftNumber = ftNumber;
        transaction.callbackData = callbackData;
        transaction.callbackReceived = true;
        transaction.completedAt = new Date();
        transaction.statusMessage = 'Payment successful';
        await transaction.save();

        console.log(`✅ Transaction ${transaction._id} marked as paid`);

    } else {
        // Payment failed or cancelled
        console.log(`❌ Payment ${transactionStatus} for loan ${loan.loanNumber}`);

        pendingPayment.status = 'rejected';
        pendingPayment.reviewedAt = new Date();
        pendingPayment.reviewNotes = `Payment ${transactionStatus}: ${callbackData.message || 'Transaction failed'}`;

        const hasOtherPending = loan.pendingPayments.some((p: any) => p.status === 'pending');
        if (!hasOtherPending) {
            loan.status = 'active';
        }

        await loan.save();

        // Update transaction
        transaction.status = 'failed';
        transaction.callbackData = callbackData;
        transaction.callbackReceived = true;
        transaction.completedAt = new Date();
        transaction.statusMessage = `Payment ${transactionStatus}`;
        await transaction.save();
    }

    res.status(200).json({
        status: 'success',
        message: 'Callback processed successfully',
        timestamp: new Date().toISOString()
    });
});

export const checkDashenPaymentStatus = asyncHandler(async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const { orderId } = req.params;

    console.log(`🔍 Checking payment status for orderId: ${orderId}`);

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
            statusMessage: transaction.statusMessage,
            createdAt: transaction.createdAt,
            completedAt: transaction.completedAt
        }
    });
});