import axios, { type AxiosInstance } from 'axios';
import { config } from '../config/dashenConfig';

export interface CustomerLookupResponse {
  statusCode: number;
  message: string;
  data: {
    phoneNumber: string;
    name: string;
    sessionId: string;
  };
}

export interface PaymentInitiationResponse {
  statusCode: number;
  message: string;
  data: {
    message: string;
  };
}

export class DashenBankClient {
  private axiosInstance: AxiosInstance;
  private base64Auth: string;

  constructor() {
    const credentials = `${config.basicAuthUsername}:${config.basicAuthPassword}`;
    this.base64Auth = Buffer.from(credentials).toString('base64');
    
    this.axiosInstance = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${this.base64Auth}`
      }
    });
    
    console.log('Dashen Client Initialized');
  }

  validatePhoneNumber(phoneNumber: string): boolean {
    const phoneRegex = /^\+251[0-9]{9}$/;
    return phoneRegex.test(phoneNumber);
  }

  async customerLookup(phoneNumber: string): Promise<CustomerLookupResponse['data']> {
    try {
      if (!this.validatePhoneNumber(phoneNumber)) {
        throw new Error('Invalid phone number format. Expected +2519XXXXXXXX (13 chars)');
      }

      const response = await this.axiosInstance.post<CustomerLookupResponse>(
        '/api/v1/lookup',
        {
          phoneNumber: phoneNumber,
          channel: 'superapp',
          serviceKey: config.serviceKey
        }
      );
      
      if (response.data.statusCode === 200 && response.data.data) {
        return response.data.data;
      } else {
        throw new Error(response.data.message || 'Customer lookup failed');
      }
    } catch (error: any) {
      console.error('Customer Lookup Error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Customer lookup failed');
    }
  }

  async initiatePayment(payload: {
    phoneNumber: string;
    creditAccount: string;
    amount: string;
    billRefNumber: string;
    narrative: string;
    serviceKey: string;
    merchantName: string;
    sessionId: string;
    callBack: string;
  }): Promise<PaymentInitiationResponse> {
    try {
      const amountNum = parseFloat(payload.amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      if (amountNum > config.maxTransactionAmount) {
        throw new Error(`Amount exceeds limit of ${config.maxTransactionAmount} ETB`);
      }
      
      const response = await this.axiosInstance.post<PaymentInitiationResponse>(
        '/api/v1/transaction',
        payload,
        {
          headers: {
            'Idempotency-Key': `${payload.billRefNumber}_${Date.now()}`
          }
        }
      );
      
      if (response.data.statusCode === 200) {
        return response.data;
      } else {
        throw new Error(response.data.message || 'Payment initiation failed');
      }
    } catch (error: any) {
      console.error('Payment Initiation Error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Payment initiation failed');
    }
  }
}

export default new DashenBankClient();