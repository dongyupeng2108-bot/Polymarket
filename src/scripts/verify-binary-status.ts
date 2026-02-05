
import { prisma } from '../lib/db';
import { getPolymarketMarket } from '../lib/adapters/polymarket';

async function main() {
  console.log('Verifying Binary Status of Pairs...');
  
  // Fetch all pairs (including draft/verified) that we want to check
  // Usually verified only, but let's check all to update metadata
  const pairs = await prisma.pair.findMany({});

  for (const p of pairs) {
    if (!p.pm_market_id || p.pm_market_id.startsWith('SLUG:')) {
        console.log(`Skipping Pair #${p.id} (Invalid ID: ${p.pm_market_id})`);
        continue;
    }

    // Call Gamma API
    const details = await getPolymarketMarket(p.pm_market_id);
    
    if (details) {
        const isBinary = details.outcomes.length === 2;
        const outcomesStr = details.outcomes.join(', ');
        
        console.log(`Pair #${p.id} (${p.title_pm}): Outcomes=[${outcomesStr}] -> Binary=${isBinary}`);

        if (p.is_binary !== isBinary) {
            await prisma.pair.update({
                where: { id: p.id },
                data: { is_binary: isBinary }
            });
            console.log(`  -> Updated is_binary to ${isBinary}`);
        }
    } else {
        console.warn(`  -> Could not fetch market details for ${p.pm_market_id}`);
    }
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
