
import { khRequest } from '../src/lib/adapters/kalshi';
import fs from 'fs';

// Constants
const KEYWORDS = ['crypto', 'bitcoin', 'politics', 'election', 'nba'];
const PARAM_MODES = ['query', 'search', 'title']; // Potential search params to test
const LIMIT = 50; 
const TIMEOUT_MS = 45000;

// Helper to analyze prefixes
function getTopPrefixes(markets: any[], topN = 3) {
    const counts: Record<string, number> = {};
    markets.forEach(m => {
        const parts = (m.ticker || '').split('-');
        const prefix = parts.length > 1 ? parts[0] : (m.category || 'UNKNOWN');
        counts[prefix] = (counts[prefix] || 0) + 1;
    });
    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
}

async function runMatrix() {
    const outputBuffer: string[] = [];
    const log = (msg: string) => {
        console.log(msg);
        outputBuffer.push(msg);
    };

    log(`[Matrix] Starting Kalshi Search Matrix Test...`);
    log(`[Matrix] Keywords: ${KEYWORDS.join(', ')}`);
    log(`[Matrix] Modes: ${PARAM_MODES.join(', ')}`);
    log(`[Matrix] Limit: ${LIMIT}`);
    
    const matrix: any[] = [];
    
    // 1. Baseline: Public All (No Keywords)
    log(`\n[Baseline] Fetching Public All (no keywords)...`);
    const baselineStart = Date.now();
    const baselineRes = await khRequest('/markets', { params: { limit: LIMIT, status: 'open' } });
    const baselineCount = baselineRes.success ? (baselineRes.data.markets || []).length : -1;
    const baselinePrefixes = baselineRes.success ? getTopPrefixes(baselineRes.data.markets || []) : 'N/A';
    
    log(`[Baseline] Result: Count=${baselineCount}, Prefixes=[${baselinePrefixes}]`);
    
    matrix.push({
        keyword: '(BASELINE_ALL)',
        mode: 'none',
        count: baselineCount,
        prefixes: baselinePrefixes,
        status: baselineRes.success ? 'OK' : (baselineRes.meta?.error_code || 'FAIL')
    });

    // 2. Matrix Loop
    for (const keyword of KEYWORDS) {
        for (const mode of PARAM_MODES) {
            const params: any = { limit: LIMIT, status: 'open' };
            params[mode] = keyword; // e.g. params.query = 'crypto'
            
            // process.stdout.write(`[Test] kw="${keyword}" mode="${mode}" ... `);
            
            try {
                const res = await khRequest('/markets', { params });
                const markets = res.data?.markets || [];
                const count = markets.length;
                const prefixes = getTopPrefixes(markets);
                
                // console.log(`Count=${count}, Top=${prefixes}`);
                
                matrix.push({
                    keyword,
                    mode,
                    count,
                    prefixes,
                    status: res.success ? 'OK' : (res.meta?.error_code || 'FAIL'),
                    // http_status: res.meta?.http_status
                });
            } catch (e: any) {
                // console.log(`ERROR: ${e.message}`);
                matrix.push({
                    keyword,
                    mode,
                    count: -1,
                    prefixes: '',
                    status: 'EXCEPTION',
                    error: e.message
                });
            }
        }
    }

    // 3. Analysis & Conclusion
    log('\n=== KALSHI SEARCH MATRIX SUMMARY ===');
    console.table(matrix);
    
    // Generate Text Summary for LOG_HEAD
    log('\n<<<LOG_HEAD>>>');
    log('[Matrix] Summary of Effectiveness:');
    
    const cryptoHits = matrix.filter(m => ['crypto', 'bitcoin'].includes(m.keyword) && m.count > 0);
    const politicsHits = matrix.filter(m => ['politics', 'election'].includes(m.keyword) && m.count > 0);
    
    if (cryptoHits.length > 0) {
        log(`[Conclusion] Crypto keywords returned results (Max: ${Math.max(...cryptoHits.map(m => m.count))}).`);
        log(`[Evidence] ${cryptoHits[0].keyword} (${cryptoHits[0].mode}) -> ${cryptoHits[0].count} markets (${cryptoHits[0].prefixes})`);
    } else {
        log(`[Conclusion] Crypto keywords returned NO results.`);
    }

    if (politicsHits.length > 0) {
        log(`[Conclusion] Politics keywords returned results (Max: ${Math.max(...politicsHits.map(m => m.count))}).`);
        log(`[Evidence] ${politicsHits[0].keyword} (${politicsHits[0].mode}) -> ${politicsHits[0].count} markets (${politicsHits[0].prefixes})`);
    } else {
        log(`[Conclusion] Politics keywords returned NO results.`);
    }

    if (baselineCount > 0 && baselinePrefixes.includes('KXMVESPORTS')) {
         log(`[Baseline] Confirmed Sports Dominance in Public Mode (${baselinePrefixes}).`);
    }

    // Write output to file if requested via CLI arg (though usually > redirects)
    // But since we use > in CMD, console.log is enough.
}

runMatrix().catch(e => console.error(e));
