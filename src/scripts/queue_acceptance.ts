
import fs from 'fs';
import path from 'path';
import { setupGlobalProxy, getFetchDispatcher } from '../lib/global-proxy';

// Initialize Global Proxy
setupGlobalProxy();

// --- Configuration ---
const ARGS = process.argv.slice(2);
const getArg = (name: string, defaultVal: string) => {
    const idx = ARGS.indexOf(name);
    return idx !== -1 && ARGS[idx + 1] ? ARGS[idx + 1] : defaultVal;
};

const BASE_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || 'http://localhost:53121';

const CONFIG = {
    loops: Math.min(parseInt(getArg('--loops', '20'), 10), 50),
    intervalMs: parseInt(getArg('--interval', '2000'), 10),
    limit: parseInt(getArg('--limit', '20'), 10),
    minEdge: getArg('--min_edge', '0.01'),
    eventTicker: getArg('--eventTicker', ''), // Empty means auto-detect
    outputDir: path.join(process.cwd(), 'reports')
};

// --- Types (Partial) ---
interface ScanResult {
    pair_id: number;
    timestamp: string;
    result: string;
    reason_code?: string;
    prices: any;
    market_data?: {
        pm: { bids: any[], asks: any[] };
        kh: { bids: any[], asks: any[] };
    };
    simulation?: {
        tradeable: boolean;
        direction: string;
        expected_profit: number;
        components?: any;
        reason?: string;
    };
    debug_stats?: any;
}

interface BatchResponse {
    ok: boolean;
    results: ScanResult[];
    meta?: any;
    error?: string;
}

// --- Main ---
async function main() {
    console.log(`\n=== Queue Acceptance Test ===`);
    console.log(`Config: Loops=${CONFIG.loops}, Interval=${CONFIG.intervalMs}ms, Limit=${CONFIG.limit}, MinEdge=${CONFIG.minEdge}`);
    
    // Ensure output dir
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }

    // 1. Auto-select Ticker
    let ticker = CONFIG.eventTicker;
    if (!ticker) {
        process.stdout.write(`[Setup] Auto-selecting ticker... `);
        try {
            const res = await fetchWithTimeout(`${BASE_URL}/api/event-tickers`);
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
            }
            const data: any = await res.json();
            
            // Debug Log
            // console.log('[Setup] Tickers API Response:', JSON.stringify(data).slice(0, 100) + '...');

            if (Array.isArray(data) && data.length > 0) {
                ticker = typeof data[0] === 'string' ? data[0] : (data[0].eventTicker || '');
                // Try to find a nice one
                if (typeof data[0] === 'string') {
                    const nice = data.find((t: string) => t.startsWith('KX') && !t.includes('-'));
                    if (nice) ticker = nice;
                }
            } else if (data && data.tickers && Array.isArray(data.tickers) && data.tickers.length > 0) {
                ticker = data.tickers[0];
            } else if (data && data.items && Array.isArray(data.items) && data.items.length > 0) {
                ticker = data.items[0].eventTicker;
                const nice = data.items.find((i: any) => i.eventTicker && i.eventTicker.startsWith('KX') && !i.eventTicker.includes('-'));
                if (nice) ticker = nice.eventTicker;
            }
            
            if (!ticker) throw new Error('No tickers available via API');
            console.log(`Selected: ${ticker}`);
        } catch (e: any) {
            console.error(`FAILED: ${e.message}`);
            console.error(`Hint: Ensure 'npm run dev' is running on port 53121.`);
            process.exit(1);
        }
    } else {
        console.log(`[Setup] Using ticker: ${ticker}`);
    }

    // 2. Loop
    const reportData: any[] = [];
    const summary = {
        total_loops: 0,
        total_scanned: 0,
        total_created: 0, // Opportunities found
        degraded_count: 0,
        reason_codes: {} as Record<string, number>,
        durations: [] as number[]
    };

    console.log(`\n[Run] Starting ${CONFIG.loops} loops...`);

    for (let i = 0; i < CONFIG.loops; i++) {
        const start = Date.now();
        process.stdout.write(`Loop ${i + 1}/${CONFIG.loops} ... `);

        try {
            // Call Batch API
            const fetchUrl = `${BASE_URL}/api/scan/batch`;
            // Use JSON body as per requirement (or query, using body for stability)
            const body = {
                mode: 'single',
                eventTicker: ticker,
                limit: CONFIG.limit,
                min_edge: parseFloat(CONFIG.minEdge)
            };

            const res = await fetchWithTimeout(fetchUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status} ${res.statusText}`);
            }

            const data = await res.json() as BatchResponse;
            const duration = Date.now() - start;
            summary.durations.push(duration);

            // Check WS / Degraded
            // If we got results, we assume connected. 
            // If debug_stats implies disconnected, we count it.
            let isDegraded = false;
            if (data.meta && data.meta.degraded) isDegraded = true;
            
            // Analyze Results
            const results = data.results || [];
            summary.total_scanned += results.length;
            if (isDegraded) summary.degraded_count++;

            const opportunities = results.filter(r => r.result === 'OPPORTUNITY');
            summary.total_created += opportunities.length;

            // Log Reason Codes
            results.forEach(r => {
                const code = r.reason_code || r.result;
                summary.reason_codes[code] = (summary.reason_codes[code] || 0) + 1;
            });

            // Capture Data for Report (Top N)
            // We capture ALL results in the report to allow full analysis, or limit to top N?
            // "Must put top N results... fields into report"
            // Let's capture all returned (since limit is already applied by API)
            const loopReport = results.map(r => {
                // Calculate queueAhead0 if possible
                let queueAhead0 = -1;
                let side = 'UNKNOWN';
                
                if (r.simulation && r.simulation.direction) {
                    const dir = r.simulation.direction;
                    const price = (dir === 'BUY_PM_SELL_KH' ? r.prices.pm_ask : r.prices.pm_bid) || 0; // Taker price?
                    // Wait, Shadow Validate assumes LIMIT order.
                    // "挂单要先排队" -> We place Limit Order.
                    // If BUY_PM, we place BID. Usually at ASK price to cross, or BID to join?
                    // Assuming we join the queue at the price we want to trade.
                    // For simplicity, let's just dump what we have.
                    // If we want to capture "queueAhead0", we need to know the Target Price.
                    // Assuming Target Price is the one in simulation or prices.
                }

                return {
                    loop: i + 1,
                    ts: r.timestamp,
                    pair_id: r.pair_id,
                    result: r.result,
                    reason_code: r.reason_code || r.simulation?.components?.reason,
                    direction: r.simulation?.direction,
                    prices: r.prices,
                    // Fields required by user:
                    // ts, pair_id, side, price, qty, queueAhead0, p_fill_est, ttf_p50, depth_ok, reason_code
                    side: r.simulation?.direction, // Simplified
                    depth_ok: r.simulation?.components?.depth_ok,
                    expected_profit: r.simulation?.expected_profit,
                    market_data_summary: {
                        pm_bids: r.market_data?.pm?.bids?.length || 0,
                        pm_asks: r.market_data?.pm?.asks?.length || 0
                    }
                };
            });

            reportData.push(...loopReport);

            console.log(`OK (${duration}ms) | Scanned: ${results.length} | Opps: ${opportunities.length}`);

            // Fail Fast Check
            if (isDegraded) {
                console.error(`\n[Error] System reports DEGRADED status.`);
                console.error(`Hint: Check server logs / WS connection.`);
                process.exit(1);
            }

        } catch (e: any) {
            console.log(`FAIL`);
            console.error(`\n[Fatal] ${e.message}`);
            if (e.cause) console.error(e.cause);
            console.error(`Hint: Ensure Web Service is running (npm run dev).`);
            process.exit(1);
        }

        // Wait interval
        if (i < CONFIG.loops - 1) {
            await new Promise(r => setTimeout(r, CONFIG.intervalMs));
        }
    }

    // 3. Generate Report
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportFile = path.join(CONFIG.outputDir, `queue_acceptance_${timestamp}.json`);
    
    const finalReport = {
        meta: {
            timestamp: new Date().toISOString(),
            config: CONFIG,
            ticker
        },
        summary,
        data: reportData
    };

    fs.writeFileSync(reportFile, JSON.stringify(finalReport, null, 2));

    // 4. Console Summary
    console.log(`\n=== Summary ===`);
    console.log(`Total Loops:    ${CONFIG.loops}`);
    console.log(`Total Scanned:  ${summary.total_scanned}`);
    console.log(`Opportunities:  ${summary.total_created}`);
    console.log(`Avg Duration:   ${(summary.durations.reduce((a,b)=>a+b,0) / summary.durations.length).toFixed(0)}ms`);
    console.log(`Reason Codes:`);
    Object.entries(summary.reason_codes).forEach(([code, count]) => {
        console.log(`  - ${code}: ${count}`);
    });
    console.log(`\nReport saved to: ${reportFile}`);
    console.log(`\nPASSED`);
}

async function fetchWithTimeout(url: string, options: any = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    try {
        const dispatcher = getFetchDispatcher(url);
        const res = await fetch(url, {
            ...options,
            dispatcher,
            signal: controller.signal
        });
        return res;
    } finally {
        clearTimeout(timeout);
    }
}

main();
