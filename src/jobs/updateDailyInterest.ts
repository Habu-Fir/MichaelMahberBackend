import cron from 'node-cron';
import Loan from '../models/Loan';

const getDailyRate = (monthlyRate: number): number => {
    return (monthlyRate / 100) / 30;
};

export const updateDailyInterest = async () => {
    console.log('📊 Running daily interest update...', new Date().toISOString());
    
    try {
        const activeLoans = await Loan.find({ status: 'active' });
        let updatedCount = 0;
        
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
                console.log(`✅ Loan ${loan.loanNumber}: +${roundedInterest.toFixed(2)} ETB interest (${daysDiff} days)`);
            }
        }
        
        console.log(`✅ Daily interest update completed. Updated ${updatedCount} loans.`);
    } catch (error) {
        console.error('❌ Error updating daily interest:', error);
    }
};

// Run every day at midnight
cron.schedule('0 0 * * *', updateDailyInterest);

// For testing: Run every minute (uncomment to test)
// cron.schedule('* * * * *', updateDailyInterest);

console.log('⏰ Daily interest scheduler initialized');