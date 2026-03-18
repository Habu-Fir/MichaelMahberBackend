// utils/interestCalculator.ts

/**
 * Calculate interest accrued since last calculation
 */
export const calculateAccruedInterest = (
    principal: number,
    interestRate: number,  // 3% monthly
    lastCalculation: Date,
    now: Date = new Date()
): number => {
    const daysDiff = Math.floor((now.getTime() - lastCalculation.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff <= 0) return 0;

    // Daily rate = monthly rate / 30 days
    const dailyRate = interestRate / 100 / 30;

    // Simple interest: principal × dailyRate × days
    return principal * dailyRate * daysDiff;
};

/**
 * When a payment is made, split between principal and interest
 */
export const splitPayment = (
    paymentAmount: number,
    outstandingPrincipal: number,
    accruedInterest: number
): { principalPortion: number; interestPortion: number } => {
    // First pay off accrued interest
    if (paymentAmount <= accruedInterest) {
        // Payment only covers some/all interest
        return {
            interestPortion: paymentAmount,
            principalPortion: 0
        };
    } else {
        // Payment covers all interest + some principal
        return {
            interestPortion: accruedInterest,
            principalPortion: paymentAmount - accruedInterest
        };
    }
};