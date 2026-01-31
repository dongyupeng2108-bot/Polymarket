
import { khRequest } from '../src/lib/adapters/kalshi';

async function run() {
    console.log('--- Kalshi Public Read-Only Smoke Test ---');
    
    // Force missing credentials
    delete process.env.KALSHI_KEY_ID;
    delete process.env.KALSHI_PRIVATE_KEY;
    
    console.log('Credentials removed from env.');

    // 1. Try public endpoint
    console.log('Testing /markets (Public)...');
    try {
        const res = await khRequest('/markets', { params: { limit: 5 } });
        
        if (res.success) {
            console.log('PASS: /markets fetch successful without credentials.');
            console.log(`Data keys: ${Object.keys(res.data).join(', ')}`);
        } else {
            console.error('FAIL: /markets fetch failed.');
            console.error(JSON.stringify(res.meta, null, 2));
            process.exit(1);
        }
    } catch (e) {
        console.error('FAIL: Exception during /markets fetch', e);
        process.exit(1);
    }

    // 2. Try private endpoint (should still fail 400 or 401/403)
    console.log('\nTesting /portfolio/balance (Private)...');
    const res2 = await khRequest('/portfolio/balance');
    
    // Logic: My change only allows bypass for /markets. So this should hit the Env Check and return 400.
    if (!res2.success && res2.meta.error_code === 'HTTP_400') {
         console.log('PASS: /portfolio/balance blocked with HTTP_400 (Env Check).');
    } else {
        console.error(`FAIL: Unexpected result for private endpoint: ${res2.success ? 'Success' : res2.meta.error_code}`);
        process.exit(1);
    }
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
