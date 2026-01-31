
import { prisma } from '../src/lib/db';
import { fetchPolymarketEvent } from '../src/lib/adapters/polymarket';
import { ProxySelector } from '../src/lib/services/proxy-selector';

async function main() {
    console.log('--- Seeding Kevin Warsh Fed Chair Pair ---');

    // 1. Configuration
    const PM_EVENT_SLUG = 'who-will-trump-nominate-as-fed-chair';
    const KH_TICKER = 'KXFEDCHAIRNOM-29-KW';
    
    // 2. Fetch Polymarket Data
    console.log(`\nFetching Polymarket event: ${PM_EVENT_SLUG}...`);
    // Initialize proxy selector just in case
    ProxySelector.getInstance(); 
    
    const pmRes = await fetchPolymarketEvent(PM_EVENT_SLUG);
    
    if (!pmRes.success) {
        console.error('FAILED to fetch Polymarket event:', pmRes.meta);
        process.exit(1);
    }

    const event = pmRes.data;
    const markets = event.markets || [];
    console.log(`Found ${markets.length} markets in event.`);

    // 3. Find Target Market
    let targetMarket = null;
    for (const m of markets) {
        const qLower = m.question.toLowerCase();
        const slugLower = m.slug.toLowerCase();
        const titleLower = (m.title || '').toLowerCase();

        if (qLower.includes('kevin warsh') || titleLower.includes('kevin warsh')) {
            targetMarket = m;
            break;
        }
        if (slugLower.includes('warsh')) {
            targetMarket = m;
            break;
        }
    }

    if (!targetMarket) {
        console.error('FAILED to find Kevin Warsh market in Polymarket event.');
        console.log('Available markets:', markets.map((m: any) => m.question || m.slug));
        process.exit(1);
    }

    console.log(`Found Market: ${targetMarket.question} (ID: ${targetMarket.id})`);

    // 4. Extract Token IDs
    let outcomes: any[] = [];
    let clobTokenIds: any[] = [];
    
    try {
        outcomes = typeof targetMarket.outcomes === 'string' ? JSON.parse(targetMarket.outcomes) : targetMarket.outcomes;
        clobTokenIds = typeof targetMarket.clobTokenIds === 'string' ? JSON.parse(targetMarket.clobTokenIds) : targetMarket.clobTokenIds;
    } catch (e) {
        console.error('Error parsing outcomes/tokens:', e);
        process.exit(1);
    }

    const yesIndex = outcomes.findIndex((o: any) => String(o).toLowerCase() === 'yes');
    if (yesIndex === -1) {
        console.error('Could not find "Yes" outcome index.');
        process.exit(1);
    }
    
    const yesTokenId = clobTokenIds[yesIndex];
    if (!yesTokenId) {
        console.error('Could not find Token ID for Yes outcome.');
        process.exit(1);
    }

    console.log(`Polymarket YES Token ID: ${yesTokenId}`);

    // 5. Prepare Pair Data
    const commonData = {
        kh_ticker: KH_TICKER,
        pm_yes_token_id: yesTokenId,
        is_binary: true,
        pm_open_url: `https://polymarket.com/event/${PM_EVENT_SLUG}`,
        kh_open_url: `https://kalshi.com/markets/kxfedchairnom/fed-chair-nominee/kxfedchairnom-29`,
        pm_market_slug: targetMarket.slug,
        pm_market_id: targetMarket.id,
        
        // Required fields by Schema
        title_pm: targetMarket.question || 'Kevin Warsh Fed Chair',
        title_kh: 'Fed Chair Nominee: Kevin Warsh',
        resolve_time_pm: new Date('2025-01-20'),
        resolve_time_kh: new Date('2025-01-20'),
        rules_pm: targetMarket.description || 'See platform',
        rules_kh: 'See platform',
        
        status: 'verified' as const, // Enum: verified
    };

    console.log('\nUpserting Pair to DB...');
    
    // Check if exists
    const existing = await prisma.pair.findFirst({
        where: { kh_ticker: KH_TICKER }
    });

    let pair;
    if (existing) {
        console.log(`Updating existing pair ID: ${existing.id}`);
        pair = await prisma.pair.update({
            where: { id: existing.id },
            data: commonData
        });
    } else {
        console.log('Creating new pair...');
        pair = await prisma.pair.create({
            data: commonData
        });
    }

    console.log('SUCCESS! Pair saved.');
    console.log(`Pair ID: ${pair.id}`);
    
    console.log('\n--- Next Steps ---');
    console.log('Run the following command to scan this pair:');
    console.log(`node -e "fetch('http://127.0.0.1:53121/api/scan/once?pairId=${pair.id}', {method:'POST'}).then(r=>r.json()).then(console.log)"`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
