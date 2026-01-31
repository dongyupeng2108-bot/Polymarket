
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
    n: parseInt(getArg('--n', '30'), 10),
    loops: Math.min(parseInt(getArg('--loops', '50'), 10), 50),
    minEdge: parseFloat(getArg('--min_edge', '-0.1')), // Allow negative EV to ensure candidates
    outputDir: path.join(process.cwd(), 'reports')
};

interface Candidate {
    pair_id: number;
    eventTicker: string;
    direction: string;
    price: number;
    qty: number;
    p_fill_est: number;
    ttf_p50: number;
    ttf_p90: number;
    queueAhead: number;
    timestamp: string;
    raw_edge: number;
}

// --- Helpers ---
async function fetchWithTimeout(url: string, options: any = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    
    try {
        const dispatcher = getFetchDispatcher(url);
        const res = await fetch(url, {
            ...options,
            signal: controller.signal,
            dispatcher
        });
        clearTimeout(timeout);
        return res;
    } catch (error) {
        clearTimeout(timeout);
        throw error;
    }
}

// --- Main ---
async function main() {
    console.log(`\n=== Real Fill Candidate Packer ===`);
    console.log(`Config: N=${CONFIG.n}, Loops=${CONFIG.loops}, MinEdge=${CONFIG.minEdge}`);
    
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }

    // 1. Get Ticker
    let ticker = '';
    try {
        const res = await fetchWithTimeout(`${BASE_URL}/api/event-tickers`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: any = await res.json();
        
        // Strategy: Try to find a nice KX ticker
        const candidates = (data.items || data.tickers || data || []).map((t: any) => typeof t === 'string' ? t : t.eventTicker);
        ticker = candidates.find((t: string) => t && t.startsWith('KX') && !t.includes('-')) || candidates[0];
        
        if (!ticker) throw new Error('No tickers found');
        console.log(`[Setup] Target Ticker: ${ticker}`);
    } catch (e: any) {
        console.error(`[Fatal] Failed to get tickers: ${e.message}`);
        console.error(`Hint: Ensure Web Service is running on port 53121 (npm run dev)`);
        process.exit(1);
    }

    const collected: Candidate[] = [];
    
    console.log(`[Run] Scanning for candidates (Max Loops: ${CONFIG.loops})...`);

    for (let i = 0; i < CONFIG.loops; i++) {
        if (collected.length >= CONFIG.n * 2) break; // Collect extra for sampling

        try {
            const url = `${BASE_URL}/api/scan/batch?mode=single&eventTicker=${ticker}&limit=20&min_edge=${CONFIG.minEdge}`;
            const res = await fetchWithTimeout(url, { method: 'POST' });
            
            if (!res.ok) {
                console.warn(`[Loop ${i+1}] HTTP ${res.status}`);
                continue;
            }

            const json: any = await res.json();
            const results = json.results || [];

            for (const r of results) {
                // Heuristic to create a "Candidate" even if not a perfect arb
                // We use 'prices' and 'simulation' data
                const pmBid = r.prices?.pm_bid || 0;
                const pmAsk = r.prices?.pm_ask || 0;
                const khBid = r.prices?.kh_bid || 0;
                const khAsk = r.prices?.kh_ask || 0;

                // Determine direction based on price gap (even if negative)
                // Buy PM (Ask) vs Sell KH (Bid) -> Direction: BUY_PM
                // Sell PM (Bid) vs Buy KH (Ask) -> Direction: SELL_PM
                
                let direction = 'NONE';
                let price = 0;
                let rawEdge = -999;
                let queueAhead = 0;

                if (pmAsk > 0 && khBid > 0) {
                    const edge = (khBid - pmAsk) / pmAsk;
                    if (edge > rawEdge) {
                        rawEdge = edge;
                        direction = 'BUY_PM';
                        price = pmAsk;
                        // Mock queue: random 0-1000
                        queueAhead = Math.floor(Math.random() * 500); 
                    }
                }
                if (pmBid > 0 && khAsk > 0) {
                    const edge = (pmBid - khAsk) / khAsk;
                    if (edge > rawEdge) {
                        rawEdge = edge;
                        direction = 'SELL_PM';
                        price = pmBid;
                        queueAhead = Math.floor(Math.random() * 500);
                    }
                }

                if (direction !== 'NONE' && rawEdge >= CONFIG.minEdge) {
                    // Heuristic for p_fill_est
                    // Higher edge -> higher p_fill
                    // Lower queue -> higher p_fill
                    let pFill = 0.5 + (rawEdge * 5); 
                    pFill = Math.max(0.1, Math.min(0.95, pFill)); // Clamp
                    
                    collected.push({
                        pair_id: r.pair_id,
                        eventTicker: ticker,
                        direction,
                        price,
                        qty: 10, // Default fixed qty
                        p_fill_est: parseFloat(pFill.toFixed(2)),
                        ttf_p50: 5000, // Mock 5s
                        ttf_p90: 15000, // Mock 15s
                        queueAhead,
                        timestamp: new Date().toISOString(),
                        raw_edge: parseFloat(rawEdge.toFixed(4))
                    });
                }
            }

            process.stdout.write(`.`);
            await new Promise(r => setTimeout(r, 500)); // Rate limit
        } catch (e: any) {
            console.error(`\n[Fatal] Loop failed: ${e.message}`);
            break;
        }
    }
    console.log('');

    if (collected.length === 0) {
        console.warn(`[Warn] No candidates found. Try lowering --min_edge.`);
        return;
    }

    // --- Sampling ---
    // Buckets: 0-0.2, 0.2-0.4, 0.4-0.6, 0.6-0.8, 0.8-1.0
    const buckets: Candidate[][] = [[], [], [], [], []];
    collected.forEach(c => {
        const idx = Math.min(4, Math.floor(c.p_fill_est / 0.2));
        buckets[idx].push(c);
    });

    const finalSelection: Candidate[] = [];
    const perBucket = Math.ceil(CONFIG.n / 5);

    buckets.forEach((b, i) => {
        // Shuffle and pick
        const shuffled = b.sort(() => 0.5 - Math.random());
        const picked = shuffled.slice(0, perBucket);
        finalSelection.push(...picked);
        console.log(`  Bucket ${i} (p=${(i*0.2).toFixed(1)}-${((i+1)*0.2).toFixed(1)}): Found ${b.length}, Picked ${picked.length}`);
    });

    // Ensure we respect N (trim if over due to rounding)
    const result = finalSelection.slice(0, CONFIG.n);

    // --- Output CSV ---
    const header = `pair_id,eventTicker,direction,price,qty,p_fill_est,ttf_p50,ttf_p90,queueAhead,timestamp,raw_edge,filled,ttf,slippage,reason`;
    const rows = result.map(c => 
        `${c.pair_id},${c.eventTicker},${c.direction},${c.price},${c.qty},${c.p_fill_est},${c.ttf_p50},${c.ttf_p90},${c.queueAhead},${c.timestamp},${c.raw_edge},,,,`
    );

    const fileName = `real_fill_candidates_${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;
    const filePath = path.join(CONFIG.outputDir, fileName);

    fs.writeFileSync(filePath, [header, ...rows].join('\n'));
    console.log(`\n[Success] Generated ${result.length} candidates.`);
    console.log(`Saved to: ${filePath}`);
    console.log(`Action: Open CSV, fill columns [filled(1/0), ttf(ms), slippage, reason], then run calibrate.`);
}

main().catch(console.error);
