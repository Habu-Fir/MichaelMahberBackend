// test-deployment.js
const axios = require('axios');

const BASE_URL = 'https://michaelmahberbackend.onrender.com';

async function testDeployment() {
    console.log('🧪 Testing Render Deployment\n');

    // Test 1: Health Check
    console.log('1. Testing Health Endpoint...');
    try {
        const health = await axios.get(`${BASE_URL}/health`);
        console.log('✅ Health OK:', health.data);
    } catch (error) {
        console.error('❌ Health failed:', error.message);
    }

    // Test 2: Check if Dashen route exists
    console.log('\n2. Testing Dashen Route (expecting 401/403, not 404)...');
    try {
        const response = await axios.post(
            `${BASE_URL}/api/v1/loans/dashen-payment/initiate`,
            {
                loanId: 'test',
                amount: 10,
                phoneNumber: '+251933839517'
            }
        );
        console.log('⚠️ Unexpected success:', response.data);
    } catch (error) {
        if (error.response?.status === 401) {
            console.log('✅ Route exists! Got 401 (Unauthorized) as expected');
        } else if (error.response?.status === 403) {
            console.log('✅ Route exists! Got 403 (Forbidden) as expected');
        } else if (error.response?.status === 404) {
            console.log('❌ Route NOT found - deployment missing routes');
        } else {
            console.log(`Status: ${error.response?.status}`, error.response?.data);
        }
    }
}

testDeployment();