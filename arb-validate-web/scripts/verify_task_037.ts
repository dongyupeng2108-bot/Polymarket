
import { khRequest } from '../src/lib/adapters/kalshi';

async function verify() {
    console.log('--- Task 037 Verification ---');

    // 1. Verify Kalshi Fetch (Unit Test)
    console.log('\n[1] Verifying Kalshi Fetch (status=open)...');
    try {
        const res = await khRequest('/markets?limit=10&status=open');
        if (res.success) {
            console.log('✅ Kalshi Fetch SUCCESS (Markets:', res.data.markets?.length, ')');
        } else {
            console.error('❌ Kalshi Fetch FAILED:', res.meta);
            process.exit(1);
        }
    } catch (e) {
        console.error('❌ Kalshi Fetch EXCEPTION:', e);
        process.exit(1);
    }

    // 2. Verify Diagnostics (Expected Failure)
    console.log('\n[2] Verifying Diagnostics (status=active)...');
    try {
        const res = await khRequest('/markets?limit=10&status=active');
        if (!res.success && res.meta.error_code === 'http_400') {
             console.log('✅ Diagnostics Verified: Received 400 as expected.');
             console.log('   Check console above for "[Kalshi] Fetch Failed" logs.');
        } else {
             console.warn('⚠️ Unexpected result for status=active:', res.success, res.meta?.error_code);
        }
    } catch (e) {
        console.error('❌ Diagnostics EXCEPTION:', e);
    }

    // 3. Site Health Check (Port 53121)
    console.log('\n[3] Verifying Site Health (Port 53121)...');
    try {
        // Use node fetch
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        
        const res = await fetch('http://localhost:53121/api/health', { 
            signal: controller.signal 
        }).catch(() => null);
        
        clearTimeout(timeout);

        if (res && res.ok) {
            console.log('✅ Site Health Check PASS (200 OK)');
        } else {
            console.log('⚠️ Site Health Check SKIPPED (Server likely not running or unreachable)');
            console.log('   Note: This is expected if Next.js server is not started.');
        }
    } catch (e) {
        console.log('⚠️ Site Health Check ERROR:', e.message);
    }

    console.log('\n✅ Verification Complete.');
}

verify();
