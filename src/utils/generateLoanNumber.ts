import Loan from '../models/Loan';

export const generateLoanNumber = async (): Promise<string> => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const prefix = `LN-${year}${month}`;

    // Find the highest loan number with this prefix
    const lastLoan = await Loan.findOne({
        loanNumber: new RegExp(`^${prefix}`)
    }).sort({ loanNumber: -1 });

    let nextNumber = 1;
    if (lastLoan) {
        const parts = lastLoan.loanNumber.split('-');
        if (parts.length === 3) {
            nextNumber = parseInt(parts[2]) + 1;
        }
    }

    const sequence = nextNumber.toString().padStart(3, '0');
    return `${prefix}-${sequence}`;
};