
import { prisma } from '../src/lib/db';
import { fetchAndSaveSnapshot } from '../src/lib/services/snapshot';
import { evaluateOpportunity } from '../src/lib/services/engine/evaluator';

async function main() {
    const pairIdStr = process.argv[2];
    if (!pairIdStr) {
        console.error('Usage: ts-node scripts/verify_opp.ts <pair_id>');
        // List first 5 pairs as hint
        const pairs = await prisma.pair.findMany({ take: 5 });
        if (pairs.length > 0) {
            console.log('Available pairs:');
            pairs.forEach(p => console.log(`  #${p.id}: ${p.title_pm}`));
        }
        process.exit(1);
    }

    const pairId = parseInt(pairIdStr, 10);
    console.log(`Verifying Opportunity Logic for Pair #${pairId}...`);

    try {
        const pair = await prisma.pair.findUnique({ where: { id: pairId } });
        if (!pair) {
            console.error(`Pair ${pairId} not found`);
            process.exit(1);
        }

        console.log(`Pair: ${pair.title_pm}`);
        console.log(`IDs: PM=${pair.pm_yes_token_id}, KH=${pair.kh_ticker}`);

        // 1. Fetch
        console.log('Fetching snapshot...');
        const result = await fetchAndSaveSnapshot(pairId);
        
        if (!result) {
            console.error('Fetch failed (returned null)');
            process.exit(1);
        }

        console.log('Snapshot ID:', result.snapshot.id);
        console.log('PM Debug:', {
            status: result.debug.pm.http_status,
            latency: result.debug.pm.latency_ms,
            error_class: result.debug.pm.error_class,
            error_code: result.debug.pm.error_code,
            proxy: result.debug.pm.proxy_used ? 'YES' : 'NO'
        });
        console.log('KH Debug:', {
            status: result.debug.kh.http_status,
            latency: result.debug.kh.latency_ms,
            error_class: result.debug.kh.error_class,
            error_code: result.debug.kh.error_code,
            proxy: result.debug.kh.proxy_used ? 'YES' : 'NO'
        });

        // 2. Evaluate
        console.log('Evaluating...');
        await evaluateOpportunity(result.snapshot, result.debug);

        // 3. Check Result
        const evaluation = await prisma.evaluation.findFirst({
            where: { snapshot_id: result.snapshot.id },
            orderBy: { id: 'desc' }
        });

        if (!evaluation) {
            console.error('No evaluation created!');
            process.exit(1);
        }

        console.log('Evaluation Result:');
        console.log('  Is Opportunity:', evaluation.is_opportunity);
        console.log('  Reason:', evaluation.reason);
        console.log('  Reason Code:', evaluation.reason_code);
        console.log('  Edge Raw:', evaluation.edge_raw);
        console.log('  Prices:', {
            pm_bid: evaluation.pm_price_bid,
            pm_ask: evaluation.pm_price_ask,
            kh_bid: evaluation.kh_price_bid,
            kh_ask: evaluation.kh_price_ask
        });
        
        if (evaluation.is_opportunity) {
             console.log('SUCCESS: Opportunity detected!');
        } else {
             console.log('INFO: No opportunity (expected if market efficient)');
        }

    } catch (e: any) {
        console.error('Error:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
