import cron from 'node-cron';
import Loan from '../models/Loan';
import systemConfigService from '../services/systemConfig.service';

const getDailyRate = (monthlyRate: number): number => {
    return (monthlyRate / 100) / 30;
};

export const updateDailyInterest = async () => {
    console.log('📊 Running daily interest update...', new Date().toISOString());

    try {
        // Find all active loans
        const activeLoans = await Loan.find({ status: 'active' });
        let updatedCount = 0;
        let totalNewInterest = 0;

        for (const loan of activeLoans) {
            const dailyRate = getDailyRate(loan.interestRate);
            const now = new Date();
            const lastCalc = loan.lastInterestCalculation || loan.disbursementDate || loan.requestDate;
            const daysDiff = Math.floor((now.getTime() - lastCalc.getTime()) / (1000 * 60 * 60 * 24));

            if (daysDiff > 0) {
                const newInterest = loan.remainingPrincipal * dailyRate * daysDiff;
                const roundedInterest = Math.round(newInterest * 100) / 100;

                loan.interestAccrued += roundedInterest;
                loan.lastInterestCalculation = now;
                await loan.save();

                updatedCount++;
                totalNewInterest += roundedInterest;
                console.log(`✅ Loan ${loan.loanNumber}: +${roundedInterest.toFixed(2)} ETB interest (${daysDiff} days)`);
            }
        }

        // Update system config total interest
        if (totalNewInterest > 0) {
            await systemConfigService.updateInterest(totalNewInterest);
        }

        console.log(`✅ Daily interest update completed. Updated ${updatedCount} loans. Total new interest: ${totalNewInterest.toFixed(2)} ETB`);
    } catch (error) {
        console.error('❌ Error updating daily interest:', error);
    }
};

// Schedule: Run every day at midnight (00:00)
cron.schedule('0 0 * * *', updateDailyInterest);

// For testing: Run every minute (uncomment to test)
// cron.schedule('* * * * *', updateDailyInterest);

console.log('⏰ Daily interest scheduler initialized');