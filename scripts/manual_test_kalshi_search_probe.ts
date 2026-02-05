

import { khRequest } from '../src/lib/adapters/kalshi';


const KEYWORDS = ['MicroStrategy', 'Kraken', 'Macron', 'Bitcoin', 'Trump'];

async function runProbe() {
    console.log(`[Kalshi Probe] Starting search probe for keywords: ${KEYWORDS.join(', ')}`);
    
    // Check Env
    if (!process.env.KALSHI_KEY_ID) {
        console.warn(`[Kalshi Probe] Warning: KALSHI_KEY_ID not set. Request might fail or be limited (Public Read-Only).`);
    }

    const results = [];

    for (const keyword of KEYWORDS) {
        console.log(`\n--- Probing: "${keyword}" ---`);
        try {
            // Try standard 'query' param which is common in V2 APIs
            // Also try 'series_ticker' if it looks like a ticker? No, keep it simple.
            // If Kalshi API doesn't support 'query', this might return all markets or error.
            // We'll inspect the result.
            const res = await khRequest('/markets', { 
                params: { 
                    limit: 10, 
                    status: 'open',
                    query: keyword 
                } 
            });

            if (!res.success) {
                console.error(`[Kalshi Probe] Request failed: ${res.meta?.error_code} (${res.meta?.http_status})`);
                results.push({ keyword, count: 0, status: 'FAILED', error: res.meta?.error_code });
                continue;
            }

            const markets = res.data.markets || [];
            console.log(`[Kalshi Probe] Hits: ${markets.length}`);
            
            const top3 = markets.slice(0, 3).map((m: any) => ({
                ticker: m.ticker,
                title: m.title,
                status: m.status
            }));

            top3.forEach((m: any, i: number) => {
                console.log(`  ${i+1}. [${m.ticker}] ${m.title}`);
            });

            results.push({ 
                keyword, 
                count: markets.length, 
                status: 'OK', 
                top3 
            });

            // Be nice to API
            await new Promise(r => setTimeout(r, 500));

        } catch (e: any) {
            console.error(`[Kalshi Probe] Exception:`, e.message);
            results.push({ keyword, count: 0, status: 'ERROR', error: e.message });
        }
    }

    console.log('\n--- Summary ---');
    console.table(results.map(r => ({
        keyword: r.keyword,
        count: r.count,
        status: r.status,
        top_sample: r.top3?.[0]?.title?.slice(0, 30) || ''
    })));
}

runProbe().catch(e => {
    console.error(e);
    process.exit(1);
});
