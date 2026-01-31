
import { prisma } from '../lib/db';
import { getPolymarketBook } from '../lib/adapters/polymarket';

async function verifyAllUnverified() {
    const pairs = await prisma.pair.findMany({
        where: { status: 'unverified' }
    });

    console.log(`Found ${pairs.length} UNVERIFIED pairs to verify.`);

    for (const pair of pairs) {
        console.log(`Verifying Pair #${pair.id}: ${pair.title_pm}`);
        
        if (!pair.pm_yes_token_id) {
            console.log('  -> Missing PM Token ID. Skipping.');
            continue;
        }

        try {
            console.log(`  Checking PM Orderbook...`);
            const book = await getPolymarketBook(pair.pm_yes_token_id);
            
            if (book.bids.length > 0 || book.asks.length > 0) {
                console.log(`  -> Orderbook Active. Promoting to VERIFIED.`);
                await prisma.pair.update({
                    where: { id: pair.id },
                    data: { status: 'verified', last_health_check: new Date(), verified_at: new Date(), verify_fail_reason: null }
                });
            } else {
                console.log(`  -> Orderbook Empty. Keeping as UNVERIFIED.`);
            }
        } catch (e: any) {
            console.error(`  -> Verification Error: ${e.message}`);
        }
    }
}

verifyAllUnverified()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
