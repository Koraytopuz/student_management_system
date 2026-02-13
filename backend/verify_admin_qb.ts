import axios from 'axios';

const API_BASE = 'http://localhost:4000';

async function verifyAdminAccess() {
    try {
        console.log('--- 1. Testing Admin Login ---');
        const loginRes = await axios.post(`${API_BASE}/auth/login`, {
            email: 'admin@example.com',
            password: 'sky123',
            role: 'admin'
        });

        const token = loginRes.data.token;
        const userRole = loginRes.data.user.role;
        console.log(`Login Successful. Role: ${userRole}`);

        if (userRole !== 'admin') {
            console.error('FAILED: Logged in user is not an admin!');
            return;
        }

        console.log('\n--- 2. Testing Question Bank Access (GET /questionbank) ---');
        const qbRes = await axios.get(`${API_BASE}/questionbank`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        console.log(`Access Successful. Found ${qbRes.data.questions.length} questions.`);

        console.log('\n--- 3. Testing Question Bank Stats (GET /questionbank/stats) ---');
        const statsRes = await axios.get(`${API_BASE}/questionbank/stats`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Stats:', statsRes.data);

        console.log('\n--- VERIFICATION SUCCESSFUL: ADMIN HAS ACCESS TO QUESTION BANK ---');
    } catch (error: any) {
        console.error('VERIFICATION FAILED!');
        if (error.response) {
            console.error(`Status: ${error.response.status}`);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Error:', error.message);
        }
    }
}

verifyAdminAccess();
