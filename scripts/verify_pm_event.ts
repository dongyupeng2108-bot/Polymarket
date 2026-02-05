import { pmRequest, fetchPolymarketEvent } from '../src/lib/adapters/polymarket';

async function main() {
    console.log('1. Fetching active events to find a valid slug...');
    // Gamma API for list of events
    const listRes = await pmRequest('/events?limit=5&active=true&closed=false', {}, 'https://gamma-api.polymarket.com');
    
    if (!listRes.success) {
        console.error('Failed to fetch events list:', listRes.meta);
        process.exit(1);
    }

    const events = listRes.data;
    if (!events || events.length === 0) {
        console.error('No active events found.');
        process.exit(1);
    }

    const targetEvent = events[0];
    const slug = targetEvent.slug;
    console.log(`Found event: ${targetEvent.title} (slug: ${slug})`);

    console.log('\n2. Testing fetchPolymarketEvent...');
    const eventRes = await fetchPolymarketEvent(slug);
    
    if (!eventRes.success) {
        console.error('Failed to fetch event details:', eventRes.meta);
        process.exit(1);
    }

    console.log('Success! Event Data Summary:');
    const e = eventRes.data;
    console.log(`Title: ${e.title}`);
    console.log(`Slug: ${e.slug}`);
    console.log(`Markets Count: ${e.markets?.length}`);
    
    if (e.markets && e.markets.length > 0) {
        const m = e.markets[0];
        console.log('\nSample Market:');
        console.log(`Question: ${m.question}`);
        console.log(`Outcomes: ${JSON.stringify(m.outcomes)}`);
        console.log(`TokenIDs: ${JSON.stringify(m.clobTokenIds)}`);
    }

    // Also verify the parsing logic I put in the route (simulate it here)
    console.log('\n3. Simulating Route Parsing Logic...');
    const markets = (e.markets || []).map((m: any) => {
        const outcomes = tryParseOutcomes(m.outcomes);
        const clobTokenIds = tryParseOutcomes(m.clobTokenIds);
        
        const outcomesUpper = outcomes.map((o: any) => String(o).toUpperCase());
        const yesIndex = outcomesUpper.indexOf('YES');
        const noIndex = outcomesUpper.indexOf('NO');
        
        let isBinary = false;
        let yesTokenId = null;
        let noTokenId = null;

        if (yesIndex !== -1 && noIndex !== -1) {
            isBinary = true;
            yesTokenId = clobTokenIds[yesIndex];
            noTokenId = clobTokenIds[noIndex];
        }

        const marketInfo: any = {
            pm_market_id: m.id,
            market_slug: m.slug,
            question: m.question,
            outcomes: outcomes,
            binary: isBinary
        };

        if (isBinary) {
            marketInfo.yes_token_id = yesTokenId;
            marketInfo.no_token_id = noTokenId;
        }

        return marketInfo;
    });

    console.log(JSON.stringify(markets[0], null, 2));
}

function tryParseOutcomes(raw: any): any[] {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        } catch {
            return [];
        }
    }
    return [];
}

main();
