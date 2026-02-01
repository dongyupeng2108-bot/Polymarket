
import { khRequest } from '../src/lib/adapters/kalshi';

async function run() {
    console.log('--- Kalshi Pagination Smoke Test ---');

    const LIMIT = 10;
    let cursor: string | undefined = undefined;
    let page = 0;
    const MAX_PAGES = 3;

    while (page < MAX_PAGES) {
        page++;
        console.log(`\nFetching Page ${page}... (cursor: ${cursor || 'initial'})`);
        
        const params: any = { limit: LIMIT, status: 'open' }; // Changed from 'active' to 'open'
        if (cursor) {
            params.cursor = cursor;
        }

        try {
            // Note: khRequest signature is (endpoint, options). 
            // If we pass params in options, they are appended.
            // But we should verify how khRequest handles params vs query string.
            // Looking at existing usage: khRequest('/markets?limit=5000&status=active')
            // It seems khRequest might just pass the string to fetch if no params provided.
            // But let's check kalshi.ts content again if needed.
            // Assuming standard adapter behavior where options.params are merged.
            
            const res = await khRequest('/markets', { params: { ...params } });
            
            if (!res.success) {
                console.error('FAIL: Fetch failed', res.meta);
                break;
            }

            const markets = res.data.markets || [];
            console.log(`PASS: Page ${page} returned ${markets.length} markets.`);
            
            // Check for cursor
            // Kalshi API usually returns cursor in response.cursor or meta.cursor?
            // Let's inspect the response structure.
            console.log('Response keys:', Object.keys(res.data));
            if (res.data.cursor) {
                console.log('Cursor found:', res.data.cursor);
                cursor = res.data.cursor;
            } else {
                console.log('No cursor in response data. Checking meta...');
                // Sometimes it's in meta? Adapter might wrap it.
                // But typically Kalshi returns { markets: [], cursor: "..." }
                console.log('Meta:', res.meta);
                cursor = undefined;
            }

            if (!cursor) {
                console.log('No more pages (cursor is empty).');
                break;
            }

        } catch (e) {
            console.error('Exception:', e);
            break;
        }
    }
}

run().catch(console.error);
