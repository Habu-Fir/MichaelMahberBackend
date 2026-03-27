import dotenv from 'dotenv';

dotenv.config();

export interface DashenConfig {
    environment: string;
    baseURL: string;
    serviceKey: string;
    merchantName: string;
    authType: 'basic' | 'oauth2';
    basicAuthUsername: string;
    basicAuthPassword: string;
    creditAccount: string;
    callbackURL: string;
    callbackSecret: string;
    maxTransactionAmount: number;
    timeout: number;
}

export const config: DashenConfig = {
    environment: process.env.DASHEN_ENVIRONMENT || 'sandbox',
    baseURL: process.env.DASHEN_BASE_URL || 'https://pushdev.dashensuperapp.com',
    serviceKey: process.env.DASHEN_SERVICE_KEY || '216XS',
    merchantName: process.env.DASHEN_MERCHANT_NAME || 'MICHAEL GROUP',
    authType: (process.env.DASHEN_AUTH_TYPE as 'basic' | 'oauth2') || 'basic',
    basicAuthUsername: process.env.DASHEN_BASIC_AUTH_USERNAME || '',
    basicAuthPassword: process.env.DASHEN_BASIC_AUTH_PASSWORD || '',
    creditAccount: process.env.DASHEN_CREDIT_ACCOUNT || '',
    callbackURL: process.env.DASHEN_CALLBACK_URL || '',
    callbackSecret: process.env.DASHEN_CALLBACK_SECRET || '',
    maxTransactionAmount: Number(process.env.DASHEN_MAX_TRANSACTION_AMOUNT) || 100000,
    timeout: Number(process.env.DASHEN_TIMEOUT) || 30000,
};

console.log('✅ Dashen Configuration Loaded:', {
    serviceKey: config.serviceKey,
    merchantName: config.merchantName,
    baseURL: config.baseURL,
    creditAccount: config.creditAccount,
});