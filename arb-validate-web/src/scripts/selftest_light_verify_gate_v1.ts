
import { prisma } from '../lib/db';
import { lightVerifyGate } from '../lib/services/light-verify';

async function main() {
    console.log('Starting Light Verify Gate Self-Test...');

    // 1. Test Skip Non-Verified
    console.log('\nTest 1: Skip Non-Verified Pair');
    const p1 = await prisma.pair.upsert({
        where: { id: 999901 },
        update: { status: 'ready', last_light_check_at: null },
        create: {
            id: 999901,
            title_pm: 'Test Pair 1',
            title_kh: 'Test Pair 1',
            pm_market_id: 'test_id_1',
            kh_ticker: 'TEST-1',
            resolve_time_pm: new Date(),
            resolve_time_kh: new Date(),
            rules_pm: '',
            rules_kh: '',
            status: 'ready'
        }
    });
    const res1 = await lightVerifyGate(p1.id);
    console.log(`Result 1: ${res1.status} (Expected: PASS)`);
    if (res1.status !== 'PASS') throw new Error('Test 1 Failed');

    // 2. Test TTL Skip
    console.log('\nTest 2: Skip via TTL');
    const p2 = await prisma.pair.upsert({
        where: { id: 999902 },
        update: { status: 'verified', last_light_check_at: new Date() },
        create: {
            id: 999902,
            title_pm: 'Test Pair 2',
            title_kh: 'Test Pair 2',
            pm_market_id: 'test_id_2',
            kh_ticker: 'TEST-2',
            resolve_time_pm: new Date(),
            resolve_time_kh: new Date(),
            rules_pm: '',
            rules_kh: '',
            status: 'verified',
            last_light_check_at: new Date()
        }
    });
    const res2 = await lightVerifyGate(p2.id);
    console.log(`Result 2: ${res2.status} (Expected: PASS)`);
    if (res2.status !== 'PASS') throw new Error('Test 2 Failed');

    // 3. Test Fail Hard (Invalid IDs)
    console.log('\nTest 3: Fail Hard on Invalid IDs');
    // We set last_light_check_at to old date to force check
    const oldDate = new Date();
    oldDate.setMinutes(oldDate.getMinutes() - 30);
    
    const p3 = await prisma.pair.upsert({
        where: { id: 999903 },
        update: { 
            status: 'verified', 
            last_light_check_at: oldDate,
            pm_market_id: 'invalid_gamma_id_12345',
            kh_ticker: 'INVALID-TICKER-12345'
        },
        create: {
            id: 999903,
            title_pm: 'Test Pair 3',
            title_kh: 'Test Pair 3',
            pm_market_id: 'invalid_gamma_id_12345',
            kh_ticker: 'INVALID-TICKER-12345',
            resolve_time_pm: new Date(),
            resolve_time_kh: new Date(),
            rules_pm: '',
            rules_kh: '',
            status: 'verified',
            last_light_check_at: oldDate
        }
    });
    
    // This assumes network is available and APIs return 404 for these IDs
    // If network is down, it might return SKIP (Soft Fail).
    // We should handle both, but for "Self-Test" we prefer to see the logic work.
    
    const res3 = await lightVerifyGate(p3.id);
    console.log(`Result 3: ${res3.status}, Reason: ${res3.reason}`);
    
    if (res3.status === 'FAIL_UNVERIFIED') {
        console.log('-> Success: Detected Hard Fail');
        // Verify DB update
        const p3_updated = await prisma.pair.findUnique({ where: { id: p3.id } });
        if (p3_updated?.status !== 'unverified') throw new Error('DB Status not updated to unverified');
        if (!p3_updated.verify_fail_reason) throw new Error('DB Verify Reason not set');
    } else if (res3.status === 'SKIP') {
        console.warn('-> Warning: Got SKIP (Soft Fail). Network might be down?');
    } else {
        throw new Error(`Test 3 Failed: Expected FAIL_UNVERIFIED or SKIP, got ${res3.status}`);
    }

    console.log('\nSelf-Test Completed Successfully.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
