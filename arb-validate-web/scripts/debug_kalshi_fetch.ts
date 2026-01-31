
import { khRequest } from '../src/lib/adapters/kalshi';

// dotenv.config(); // Removed

// Mock ProxySelector if needed, or rely on existing behavior (might fail if singletons/DB not init)
// But khRequest uses ProxySelector.getInstance(). 
// Let's try running it.

async function run() {
    console.log('Testing khRequest...');
    try {
        console.log('--- Test 1: status=active (Expected Fail) ---');
        let res = await khRequest('/markets?limit=10&status=active');
        console.log('Result (active):', res.success, res.meta?.error_code);
        
        console.log('--- Test 2: status=open ---');
        res = await khRequest('/markets?limit=10&status=open');
        console.log('Result (open):', res.success);
        if (!res.success) {
            console.log('Meta (open):', JSON.stringify(res.meta, null, 2));
        } else {
            console.log('Data Markets (open):', res.data.markets?.length);
        }
    } catch (e) {
        console.error('Crash:', e);
    }
}

run();
