
import { khRequest } from '../src/lib/adapters/kalshi';

// Fail-fast configuration
const MAX_PAGES = 3;
const TIMEOUT_MS = 25000;

console.log('[Probe] Starting Kalshi Universe Probe...');

// Fail-fast timeout
const timeoutId = setTimeout(() => {
    console.error(`[Probe] Timeout after ${TIMEOUT_MS}ms`);
    process.exit(1);
}, TIMEOUT_MS);

// Auth obfuscation
const authFingerprint = process.env.KALSHI_KEY_ID 
    ? (process.env.KALSHI_KEY_ID.slice(0, 4) + '****') 
    : 'None';
const authMode = process.env.KALSHI_KEY_ID ? 'auth' : 'public';

console.log(`[Probe] Mode: ${authMode}, BaseURL: ${process.env.KALSHI_API_URL || 'Default'}`);
console.log(`[Probe] Auth Fingerprint: ${authFingerprint}`);

async function run() {
    try {
        let markets: any[] = [];
        let cursor: string | undefined = undefined;
        let pageCount = 0;

        while (pageCount < MAX_PAGES) {
            pageCount++;
            console.log(`[Probe] Fetching page ${pageCount}...`);
            
            const params: any = { limit: 100, status: 'open' };
            if (cursor) params.cursor = cursor;

            const res = await khRequest('/markets', { params });
            
            if (!res.success) {
                console.error('[Probe] Fetch failed:', res.meta);
                process.exit(1);
            }

            const pageMarkets = res.data.markets || [];
            if (pageMarkets.length === 0) break;

            markets = markets.concat(pageMarkets);
            cursor = res.data.cursor;
            
            if (!cursor) break;
        }

        console.log(`[Probe] Fetched ${markets.length} markets in ${pageCount} pages.`);

        // Analyze Universe
        const prefixCounts: Record<string, number> = {};
        markets.forEach((m: any) => {
            const parts = (m.ticker || '').split('-');
            const prefix = parts.length > 1 ? parts[0] : (m.category || 'UNKNOWN');
            prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
        });

        const sortedPrefixes = Object.entries(prefixCounts).sort((a, b) => b[1] - a[1]);
        const topPrefix = sortedPrefixes[0];
        
        console.log('[Probe] Top Prefixes:');
        sortedPrefixes.slice(0, 5).forEach(([p, c]) => {
            console.log(`  ${p}: ${c} (${((c / markets.length) * 100).toFixed(1)}%)`);
        });

        // Conclusion
        let conclusion = 'MIXED';
        let dominance = 0;
        if (topPrefix) {
            dominance = (topPrefix[1] / markets.length);
            if (dominance > 0.8 && (topPrefix[0].includes('SPORT') || topPrefix[0].includes('KX'))) {
                conclusion = 'SPORTS-ONLY';
            }
        }

        console.log(`Probe Result: ${conclusion}`);
        console.log(`Timestamp: ${new Date().toISOString()}`);
        console.log(`Auth Mode: ${authMode} (KeyID: ${authFingerprint})`);
        console.log(`Conclusion: ${conclusion.toLowerCase()} (Top Dominance: ${(dominance * 100).toFixed(1)}%)`);

        clearTimeout(timeoutId);
        process.exit(0);

    } catch (e) {
        console.error('[Probe] Error:', e);
        process.exit(1);
    }
}

run();
