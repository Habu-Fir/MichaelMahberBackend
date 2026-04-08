// services/interestAccrual.service.ts
import Loan from '../models/Loan';
import systemConfigService from './systemConfig.service';

const getDailyRate = (monthlyRate: number): number => {
    return (monthlyRate / 100) / 30;
};

/**
 * Calculate and accrue daily interest for all active loans
 * This should be run once per day via cron job
 */
export const calculateDailyInterest = async () => {
    console.log('\n💰 ===== DAILY INTEREST CALCULATION STARTED =====');
    const startTime = Date.now();

    try {
        // Find all active loans
        const activeLoans = await Loan.find({ status: 'active' });

        if (activeLoans.length === 0) {
            console.log('No active loans found. Skipping interest calculation.');
            return { success: true, processed: 0, totalInterest: 0 };
        }

        console.log(`Found ${activeLoans.length} active loans`);

        let totalInterestAccrued = 0;
        let processedCount = 0;

        for (const loan of activeLoans) {
            const now = new Date();
            const lastCalc = loan.lastInterestCalculation || loan.disbursementDate || loan.requestDate;

            // Calculate days difference
            const daysDiff = Math.floor((now.getTime() - lastCalc.getTime()) / (1000 * 60 * 60 * 24));

            if (daysDiff > 0) {
                const dailyRate = getDailyRate(loan.interestRate);
                const newInterest = loan.remainingPrincipal * dailyRate * daysDiff;
                const roundedInterest = Math.round(newInterest * 100) / 100;

                if (roundedInterest > 0) {
                    loan.interestAccrued += roundedInterest;
                    loan.lastInterestCalculation = now;

                    totalInterestAccrued += roundedInterest;
                    processedCount++;

                    console.log(`Loan ${loan.loanNumber}: +${roundedInterest} ETB interest (${daysDiff} days)`);

                    await loan.save();

                    // Update system config with new interest
                    await systemConfigService.updateInterest(roundedInterest);
                }
            }
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ Daily interest calculation completed in ${duration}s`);
        console.log(`📊 Processed: ${processedCount} loans, Total interest: ${totalInterestAccrued} ETB`);

        return {
            success: true,
            processed: processedCount,
            totalInterest: totalInterestAccrued,
            duration
        };
    } catch (error) {
        console.error('❌ Error calculating daily interest:', error);
        return {
            success: false,
            error: error.message,
            processed: 0,
            totalInterest: 0
        };
    }
};

/**
 * Calculate interest for a single loan (for on-demand updates)
 */
export const calculateLoanInterest = async (loanId: string) => {
    const loan = await Loan.findById(loanId);

    if (!loan || loan.status !== 'active') {
        return { success: false, message: 'Loan not active' };
    }

    const now = new Date();
    const lastCalc = loan.lastInterestCalculation || loan.disbursementDate || loan.requestDate;
    const daysDiff = Math.floor((now.getTime() - lastCalc.getTime()) / (1000 * 60 * 60 * 24));

    let newInterest = 0;

    if (daysDiff > 0) {
        const dailyRate = getDailyRate(loan.interestRate);
        newInterest = loan.remainingPrincipal * dailyRate * daysDiff;
        newInterest = Math.round(newInterest * 100) / 100;

        if (newInterest > 0) {
            loan.interestAccrued += newInterest;
            loan.lastInterestCalculation = now;
            await loan.save();

            // Update system config
            await systemConfigService.updateInterest(newInterest);
        }
    }

    return {
        success: true,
        daysDiff,
        interestAccrued: newInterest,
        totalInterestAccrued: loan.interestAccrued,
        lastCalculation: loan.lastInterestCalculation
    };
};

/**
 * Get interest summary for dashboard
 */
export const getInterestSummary = async () => {
    const activeLoans = await Loan.find({ status: 'active' });

    let totalInterestAccrued = 0;
    let totalInterestPaid = 0;
    let totalUnpaidInterest = 0;

    for (const loan of activeLoans) {
        totalInterestAccrued += loan.interestAccrued || 0;
        totalInterestPaid += loan.interestPaid || 0;
    }

    totalUnpaidInterest = totalInterestAccrued - totalInterestPaid;

    return {
        totalInterestAccrued,
        totalInterestPaid,
        totalUnpaidInterest,
        activeLoanCount: activeLoans.length
    };
};