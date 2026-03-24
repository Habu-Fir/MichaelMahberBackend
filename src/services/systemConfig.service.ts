import SystemConfig from '../models/SystemConfig';
import Contribution from '../models/Contribution';
import Loan from '../models/Loan';

class SystemConfigService {
    
    async initializeConfig() {
        const config = await SystemConfig.findOne();
        if (!config) {
            const newConfig = await SystemConfig.create({
                totalContributions: 188021,
                totalInterest: 0,
                totalAvailable: 188021
            });
            console.log('✅ System config initialized with total contributions: 188,021 ETB');
            return newConfig;
        }
        return config;
    }
    
    async getConfig() {
        let config = await SystemConfig.findOne();
        if (!config) {
            config = await this.initializeConfig();
        }
        
        // Recalculate from actual data
        const contributions = await Contribution.aggregate([
            { $match: { status: 'paid' } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        
        const loans = await Loan.aggregate([
            { $group: { _id: null, interest: { $sum: '$interestPaid' } } }
        ]);
        
        const newContributions = contributions[0]?.total || 0;
        const totalInterest = loans[0]?.interest || 0;
        
        config.totalContributions = 188021 + newContributions;
        config.totalInterest = totalInterest;
        config.totalAvailable = config.totalContributions + config.totalInterest;
        await config.save();
        
        return config;
    }
    
    async updateContributions(amount: number) {
        const config = await this.getConfig();
        config.totalContributions += amount;
        config.totalAvailable = config.totalContributions + config.totalInterest;
        await config.save();
        return config;
    }
    
    async updateInterest(amount: number) {
        const config = await this.getConfig();
        config.totalInterest += amount;
        config.totalAvailable = config.totalContributions + config.totalInterest;
        await config.save();
        return config;
    }
    
    async isLoanAmountAvailable(amount: number): Promise<boolean> {
        const config = await this.getConfig();
        return amount <= config.totalAvailable;
    }
    
    async getTotalAvailable(): Promise<number> {
        const config = await this.getConfig();
        return config.totalAvailable;
    }
}

export default new SystemConfigService();