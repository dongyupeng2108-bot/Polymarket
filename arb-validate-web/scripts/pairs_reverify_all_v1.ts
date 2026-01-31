
import { prisma } from '../src/lib/db';
import { lightVerifyGate } from '../src/lib/services/light-verify';

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');

    console.log('--- Deep Verification (Full Library Re-verification) ---');
    if (dryRun) console.log('--- DRY RUN MODE (No DB updates) ---');
    console.log(`Time: ${new Date().toISOString()}`);

    try {
        // 1. Fetch all VERIFIED pairs
        const pairs = await prisma.pair.findMany({
            where: { status: 'verified' },
            select: { id: true, title_pm: true, title_kh: true }
        });

        console.log(`Found ${pairs.length} VERIFIED pairs.`);
        
        let passed = 0;
        let failed = 0;
        let skipped = 0;
        const total = pairs.length;
        const BATCH_SIZE = 5; // Concurrency limit
        const DELAY_MS = 200; // Delay between batches to be nice to APIs

        for (let i = 0; i < total; i += BATCH_SIZE) {
            const batch = pairs.slice(i, i + BATCH_SIZE);
            console.log(`Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(total/BATCH_SIZE)} (${batch.length} pairs)...`);

            await Promise.all(batch.map(async (p) => {
                try {
                    // Force verification (bypass TTL)
                    const res = await lightVerifyGate(p.id, { force: true, dryRun });
                    
                    if (res.status === 'PASS') {
                        passed++;
                        // console.log(`  [PASS] #${p.id}`);
                    } else if (res.status === 'FAIL_UNVERIFIED') {
                        failed++;
                        console.warn(`  [FAIL] #${p.id} ${p.title_pm} -> UNVERIFIED: ${res.reason}`);
                    } else {
                        skipped++;
                        console.log(`  [SKIP] #${p.id} Reason: ${res.reason}`);
                    }
                } catch (e: any) {
                    console.error(`  [ERROR] Processing #${p.id}: ${e.message}`);
                    skipped++;
                }
            }));

            if (i + BATCH_SIZE < total) {
                await new Promise(r => setTimeout(r, DELAY_MS));
            }
        }

        console.log('\n--- Summary ---');
        console.log(`Total: ${total}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed (set to UNVERIFIED): ${failed}`);
        console.log(`Skipped (Soft Error): ${skipped}`);
        console.log('Done.');

    } catch (e: any) {
        console.error('Fatal Error:', e);
        process.exit(1);
    }
}

main();
