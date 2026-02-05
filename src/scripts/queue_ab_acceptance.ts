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
    samples: parseInt(getArg('--samples', '30'), 10),
    loops: parseInt(getArg('--loops', '100'), 10),
    intervalMs: parseInt(getArg('--interval', '2000'), 10),
    limit: parseInt(getArg('--limit', '50'), 10),
    minEdge: parseFloat(getArg('--min_edge', '-0.05')),
    scanMinEdge: parseFloat(getArg('--scan_min_edge', '-0.99')),
    maxMs: parseInt(getArg('--max_ms', '600000'), 10), // 10 minutes default
    stallLoops: parseInt(getArg('--stall_loops', '5'), 10),
    tickersToTry: parseInt(getArg('--tickers_to_try', '100'), 10),
    eventTicker: getArg('--eventTicker', ''),
    modelA: getArg('--A', 'queue_trade_real'),
    modelB: getArg('--B', 'queue_trade_baseline'),
    outputDir: path.join(process.cwd(), 'reports')
};

const AUTO_TUNE_LEVELS = [-0.05, -0.1, -0.2, -0.4, -0.8, -0.95];

// --- Types ---
interface ScanResult {
    pair_id: number;
    timestamp: string;
    prices: { pm_bid: number, pm_ask: number, kh_bid: number, kh_ask: number };
    market_data?: {
        pm: { bids: any[], asks: any[] };
        kh: { bids: any[], asks: any[] };
    };
    edge_raw?: number;
    status?: string;
}

interface SimResult {
    model: string;
    filled: boolean;
    reason_code: string;
    p_fill_est: number;
    ttf_p50: number;
    queueAhead: number;
    details: any;
}

interface ABRecord {
    ts: string;
    pair_id: number;
    side: string;
    prices: string;
    edge_raw: number;
    queueAhead: number;
    result_A: SimResult;
    result_B: SimResult;
    latency_ms: number;
    min_edge_used: number;
}

// --- Helpers ---
async function fetchWithTimeout(url: string, options: any = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s Timeout
    
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

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// --- Simulation Logic ---

function getDirectionAndEdge(r: ScanResult) {
    const pmBid = r.prices?.pm_bid || 0;
    const pmAsk = r.prices?.pm_ask || 0;
    const khBid = r.prices?.kh_bid || 0;
    const khAsk = r.prices?.kh_ask || 0;

    let direction = 'NONE';
    let rawEdge = -999;
    let price = 0;

    // We select direction based on "better" potential
    const edgeBuy = (pmAsk > 0 && khBid > 0) ? (khBid - pmAsk) / pmAsk : -999;
    const edgeSell = (pmBid > 0 && khAsk > 0) ? (pmBid - khAsk) / khAsk : -999;

    if (edgeBuy > edgeSell && edgeBuy > -999) {
        direction = 'BUY_PM';
        rawEdge = edgeBuy;
        price = pmAsk;
    } else if (edgeSell > -999) {
        direction = 'SELL_PM';
        rawEdge = edgeSell;
        price = pmBid;
    }

    return { direction, rawEdge, price };
}

function simulateModel(modelName: string, r: ScanResult, mockQueueAhead: number, minEdgeThreshold: number): SimResult {
    const { direction, rawEdge } = getDirectionAndEdge(r);

    if (direction === 'NONE') {
        return { model: modelName, filled: false, reason_code: 'NO_LIQUIDITY', p_fill_est: 0, ttf_p50: 0, queueAhead: 0, details: {} };
    }

    // Adjust probability calculation based on minEdgeThreshold
    // If minEdgeThreshold is lower (e.g. -0.8), we should be more lenient with negative edges.
    // We normalize edge relative to threshold? Or just shift the curve?
    // Let's shift the curve so that minEdgeThreshold corresponds to a low but non-zero probability.

    // Baseline: Ignore Queue
    if (modelName === 'queue_trade_baseline') {
        let p = 0;
        if (rawEdge > 0) {
            p = 1.0;
        } else {
            // If rawEdge is above threshold, give it a chance
            if (rawEdge >= minEdgeThreshold) {
                 // Linear interpolation: minEdge -> 0.1, 0 -> 0.5
                 const range = 0 - minEdgeThreshold; // e.g. 0.05 or 0.8
                 const dist = rawEdge - minEdgeThreshold; // how far above floor
                 const factor = range > 0 ? dist / range : 0;
                 p = 0.1 + (factor * 0.4); 
            } else {
                p = 0;
            }
        }

        const filled = Math.random() < p;
        const reason = filled ? 'FILLED' : (rawEdge < minEdgeThreshold ? 'EDGE_LOW' : 'NO_FILL_CHANCE');

        return {
            model: modelName,
            filled,
            reason_code: reason,
            p_fill_est: parseFloat(p.toFixed(2)),
            ttf_p50: 1000, 
            queueAhead: 0, 
            details: { rawEdge, minEdgeThreshold }
        };
    }

    // Real: Use Queue
    if (modelName === 'queue_trade_real') {
        // Base P from Edge
        // We want consistency: minEdge -> Low P
        
        let pEdge = 0;
        if (rawEdge > 0) {
             pEdge = 0.5 + (rawEdge * 5);
        } else {
             if (rawEdge >= minEdgeThreshold) {
                 const range = 0 - minEdgeThreshold;
                 const dist = rawEdge - minEdgeThreshold;
                 const factor = range > 0 ? dist / range : 0;
                 pEdge = 0.1 + (factor * 0.4);
             } else {
                 pEdge = 0;
             }
        }

        // Queue Penalty
        let pQueue = mockQueueAhead * 0.002;
        
        let p = pEdge - pQueue;
        p = Math.max(0, Math.min(1, p));
        
        const filled = Math.random() < p;
        
        let reason = 'UNKNOWN';
        if (filled) reason = 'FILLED';
        else if (rawEdge < minEdgeThreshold) reason = 'EDGE_LOW';
        else if (pQueue > pEdge) reason = 'QUEUE_TIMEOUT';
        else reason = 'NO_FILL_CHANCE';

        return {
            model: modelName,
            filled,
            reason_code: reason,
            p_fill_est: parseFloat(p.toFixed(2)),
            ttf_p50: 1000 + (mockQueueAhead * 10), 
            queueAhead: mockQueueAhead,
            details: { rawEdge, p_raw: p, minEdgeThreshold }
        };
    }

    return { model: modelName, filled: false, reason_code: 'UNKNOWN_MODEL', p_fill_est: 0, ttf_p50: 0, queueAhead: 0, details: {} };
}

// --- Main ---
async function main() {
    console.log(`\n=== Queue A/B Acceptance Test ===`);
    console.log(`Config: Target Samples=${CONFIG.samples}, Max Loops=${CONFIG.loops}, Interval=${CONFIG.intervalMs}ms`);
    console.log(`Params: Limit=${CONFIG.limit}, MinEdge=${CONFIG.minEdge}`);
    console.log(`Time Limit: ${CONFIG.maxMs}ms`);
    console.log(`Model A: ${CONFIG.modelA}`);
    console.log(`Model B: ${CONFIG.modelB}`);

    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }

    const startTime = Date.now();
    let candidatesStats: any[] = [];
    let selectedTickers: any[] = []; 
    
    // 1. Get Candidates
    if (CONFIG.eventTicker) {
        candidatesStats.push({ ticker: CONFIG.eventTicker, maxBestEdge: 0, validQuotes: 1, validSamples: 0 });
    } else {
        process.stdout.write(`[Setup] Fetching candidates...\n`);
        try {
            const res = await fetchWithTimeout(`${BASE_URL}/api/event-tickers`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data: any = await res.json();
            
            const rawItems = (data.items || data.tickers || data || []);
            const candidates = rawItems
                .map((t: any) => typeof t === 'string' ? t : t.eventTicker)
                .filter((t: string) => t && t.startsWith('KX'))
                .slice(0, 100);

            process.stdout.write(`[Setup] Probing ${candidates.length} candidates... `);
            
            for (const cand of candidates) {
                if (Date.now() - startTime > CONFIG.maxMs) break;

                try {
                    const probeUrl = `${BASE_URL}/api/scan/batch?mode=single&eventTicker=${cand}&limit=20&min_edge=-0.99`;
                    const pRes = await fetchWithTimeout(probeUrl, { method: 'POST' });
                    if (!pRes.ok) {
                        process.stdout.write(`x`);
                        continue;
                    }
                    const pJson: any = await pRes.json();
                    const results = pJson.results || [];
                    
                    let currentMaxEdge = -999;
                    let validQuotes = 0;
                    let validSamples = 0;

                    for (const r of results) {
                        const hasQuotes = (r.prices?.pm_bid > 0 || r.prices?.pm_ask > 0) && (r.prices?.kh_bid > 0 || r.prices?.kh_ask > 0);
                        if (hasQuotes) {
                            validQuotes++;
                            const { rawEdge } = getDirectionAndEdge(r);
                            if (rawEdge > currentMaxEdge) currentMaxEdge = rawEdge;
                        }
                        if (r.status === 'ok') validSamples++;
                    }

                    if (validQuotes > 0) {
                        candidatesStats.push({
                            ticker: cand,
                            maxBestEdge: currentMaxEdge,
                            validQuotes,
                            validSamples
                        });
                        process.stdout.write(`+`);
                    } else {
                        process.stdout.write(`.`);
                    }
                } catch (e) {
                    process.stdout.write(`e`);
                }
            }
            console.log('');
            
            // Sort: ValidQuotes DESC, then BestEdge DESC
            candidatesStats.sort((a, b) => {
                const scoreA = a.validQuotes * 100 + a.maxBestEdge;
                const scoreB = b.validQuotes * 100 + b.maxBestEdge;
                return scoreB - scoreA;
            });
            
            console.log(`[Setup] Found ${candidatesStats.length} valid candidates.`);
        } catch (e: any) {
            console.error(`[Setup] Failed: ${e.message}`);
            process.exit(1);
        }
    }

    const records: ABRecord[] = [];
    const seenPairs = new Set<string>(); 
    let stopReason = 'UNKNOWN';
    const tickersToUse = candidatesStats.slice(0, CONFIG.tickersToTry);

    if (tickersToUse.length === 0) {
        console.error('No valid tickers found to test.');
        process.exit(1);
    }

    let stallSwitches = 0;

    // 2. Main Collection Loop
    let globalMinEdgeIndex = 0;
    
    outerLoop:
    while (globalMinEdgeIndex < AUTO_TUNE_LEVELS.length) {
        if (records.length >= CONFIG.samples) break;
        if (Date.now() - startTime > CONFIG.maxMs) {
            stopReason = 'TIMEOUT';
            break;
        }

        const currentMinEdge = AUTO_TUNE_LEVELS[globalMinEdgeIndex];
        console.log(`\n[Round] Starting round with min_edge = ${currentMinEdge}`);
        
        for (const cand of tickersToUse) {
            if (records.length >= CONFIG.samples) {
                stopReason = 'REACHED_SAMPLES';
                break outerLoop;
            }
            if (Date.now() - startTime > CONFIG.maxMs) {
                stopReason = 'TIMEOUT';
                break outerLoop;
            }

            const ticker = cand.ticker;

            // --- Capacity Check & First Fetch ---
            let preScanResults: ScanResult[] = [];
            try {
                // Fetch with scanMinEdge to get full picture
                const scanUrl = `${BASE_URL}/api/scan/batch?mode=single&eventTicker=${ticker}&limit=${CONFIG.limit}&min_edge=${CONFIG.scanMinEdge}`;
                const res = await fetchWithTimeout(scanUrl, { method: 'POST' });
                if (!res.ok) continue;
                const json = await res.json();
                preScanResults = (json.results || []).filter((r: any) => 
                     r.status === 'ok' &&
                    (r.prices?.pm_bid > 0 || r.prices?.pm_ask > 0) && (r.prices?.kh_bid > 0 || r.prices?.kh_ask > 0)
                );
                
                const uniqueCap = new Set(preScanResults.map(r => `${r.pair_id}:${getDirectionAndEdge(r).direction}`)).size;
                const needed = CONFIG.samples - records.length;
                
                // Impossible to complete early check
                // Skip if ticker capacity is strictly less than what we need to finish (unless we are just starting and don't want to be too picky)
                if (records.length > 0 && uniqueCap < needed) {
                     console.log(`\n[Skip] ${ticker} (Cap=${uniqueCap} < Needed=${needed})`);
                     continue;
                }
                // Also skip if very low capacity at start (avoid useless tickers)
                if (records.length === 0 && uniqueCap < 2) {
                    // console.log(`\n[Skip] ${ticker} (Cap=${uniqueCap} too low)`);
                    continue;
                }
                
            } catch (e) {
                continue;
            }

            // Only add to selectedTickers if not already present or just update count?
            let tickerStat = selectedTickers.find(t => t.ticker === ticker);
            if (!tickerStat) {
                tickerStat = { ...cand, samplesCount: 0 };
                selectedTickers.push(tickerStat);
            }
            
            console.log(`\n[Switch] Using ticker: ${ticker} (ValidQuotes: ${cand.validQuotes}, BestEdge: ${cand.maxBestEdge.toFixed(4)})`);
            
            let consecutiveZeroSamples = 0;

            // Loop for current ticker
            for (let i = 0; i < CONFIG.loops; i++) {
                if (records.length >= CONFIG.samples) {
                    stopReason = 'REACHED_SAMPLES';
                    break outerLoop;
                }
                if (Date.now() - startTime > CONFIG.maxMs) {
                    stopReason = 'TIMEOUT';
                    break outerLoop;
                }

                const startLoop = Date.now();
                let results: ScanResult[] = [];
                
                try {
                    // Reuse pre-scan results for the first loop to save time
                    if (i === 0 && preScanResults.length > 0) {
                        results = preScanResults;
                    } else {
                        // Fetch with permissive scanMinEdge
                        const url = `${BASE_URL}/api/scan/batch?mode=single&eventTicker=${ticker}&limit=${CONFIG.limit}&min_edge=${CONFIG.scanMinEdge}`;
                        const res = await fetchWithTimeout(url, { method: 'POST' });
                        
                        if (!res.ok) {
                            console.warn(`[Loop ${i+1}] HTTP ${res.status}`);
                            await sleep(CONFIG.intervalMs);
                            continue;
                        }

                        const json: any = await res.json();
                        results = json.results || [];
                    }

                    const duration = Date.now() - startLoop;

                    // 1. Filter Valid
                    results = results.filter(r => 
                        r.status === 'ok' &&
                        (r.prices?.pm_bid > 0 || r.prices?.pm_ask > 0) && (r.prices?.kh_bid > 0 || r.prices?.kh_ask > 0)
                    );

                    // 2. Sort by Edge DESC
                    results.sort((a, b) => {
                        const edgeA = getDirectionAndEdge(a).rawEdge;
                        const edgeB = getDirectionAndEdge(b).rawEdge;
                        return edgeB - edgeA;
                    });

                    // 3. Take Top K (10)
                    const topK = results.slice(0, 10);

                    let loopSamples = 0;

                    // Relax deduplication if close to target (>= target - 2)
                    const isCloseToTarget = records.length >= CONFIG.samples - 2;

                    for (const r of topK) {
                        if (records.length >= CONFIG.samples) break;

                        const { direction, rawEdge, price } = getDirectionAndEdge(r);
                        if (direction === 'NONE') continue;

                        // 4. Sample Condition: edge >= currentMinEdge
                        if (rawEdge < currentMinEdge) continue;

                        // 5. Deduplicate
                        let key = `${r.pair_id}:${direction}`;
                        if (isCloseToTarget) {
                            // Add minute bucket to allow re-sampling same pair after a minute
                            const minuteBucket = Math.floor(Date.now() / 60000);
                            key = `${key}:${minuteBucket}`;
                        }

                        if (seenPairs.has(key)) continue;

                        seenPairs.add(key);

                        // Mock Queue
                        const mockQueueAhead = Math.floor((r.pair_id * 13 + i * 7) % 300); 

                        // Simulate
                        const resA = simulateModel(CONFIG.modelA, r, mockQueueAhead, currentMinEdge);
                        const resB = simulateModel(CONFIG.modelB, r, mockQueueAhead, currentMinEdge);

                        records.push({
                            ts: new Date().toISOString(),
                            pair_id: r.pair_id,
                            side: direction,
                            prices: price.toFixed(2),
                            edge_raw: parseFloat(rawEdge.toFixed(4)),
                            queueAhead: mockQueueAhead,
                            result_A: resA,
                            result_B: resB,
                            latency_ms: duration,
                            min_edge_used: currentMinEdge
                        });
                        
                        loopSamples++;
                        tickerStat.samplesCount++;
                    }

                    // Console Feedback
                    const elapsed = Date.now() - startTime;
                    const elapsedMin = elapsed / 60000;
                    const rate = records.length / (elapsedMin || 1); // samples per minute
                    const remaining = CONFIG.samples - records.length;
                    const etaMin = rate > 0 ? (remaining / rate).toFixed(1) : '?';
                    
                    if (i % 10 === 0) {
                        console.log(`\n[Status] Rate: ${rate.toFixed(1)}/m | ETA: ${etaMin}m | Stopwatch: ${(elapsed/1000).toFixed(0)}s`);
                    }

                    process.stdout.write(`Round[${currentMinEdge}] | ${ticker.split('-')[0]} | Loop ${i+1}/${CONFIG.loops} | Samples: ${records.length}/${CONFIG.samples} (+${loopSamples}) | Stall: ${loopSamples===0 ? consecutiveZeroSamples+1 : 0}/${CONFIG.stallLoops}\r`);

                    // Stall Logic
                    if (loopSamples === 0) {
                        consecutiveZeroSamples++;
                        
                        if (consecutiveZeroSamples >= CONFIG.stallLoops) {
                            console.log(`\n[Stall] No samples for ${CONFIG.stallLoops} loops. Switching ticker...`);
                            stallSwitches++;
                            break; // Switch ticker immediately
                        }
                    } else {
                        consecutiveZeroSamples = 0; // Reset on success
                    }

                } catch (e: any) {
                    console.error(`\n[Loop ${i+1}] Error: ${e.message}`);
                }
                
                if (records.length < CONFIG.samples) {
                    await sleep(CONFIG.intervalMs);
                }
            }
        }
        
        globalMinEdgeIndex++;
    }

    if (stopReason === 'UNKNOWN') {
        if (records.length >= CONFIG.samples) {
            stopReason = 'REACHED_SAMPLES';
        } else {
            stopReason = 'MAX_LOOPS_OR_STALLED';
        }
    }
    
    console.log(''); 

    // --- Report Generation ---
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // CSV
    const csvHeader = `ts,pair_id,side,edge_raw,min_edge,queueAhead,A_filled,A_reason,B_filled,B_reason,diff_filled`;
    const csvRows = records.map(r => {
        const diff = (r.result_A.filled ? 1 : 0) - (r.result_B.filled ? 1 : 0);
        return `${r.ts},${r.pair_id},${r.side},${r.edge_raw},${r.min_edge_used},${r.queueAhead},${r.result_A.filled},${r.result_A.reason_code},${r.result_B.filled},${r.result_B.reason_code},${diff}`;
    });
    
    const csvPath = path.join(CONFIG.outputDir, `queue_ab_acceptance_${timestamp}.csv`);
    fs.writeFileSync(csvPath, [csvHeader, ...csvRows].join('\n'));

    // JSON Summary
    const filledA = records.filter(r => r.result_A.filled);
    const filledB = records.filter(r => r.result_B.filled);
    const uniquePairs = new Set(records.map(r => r.pair_id));
    const uniquePairSides = new Set(records.map(r => `${r.pair_id}:${r.side}`));

    const summary = {
        config: CONFIG,
        total_samples: records.length,
        stop_reason: stopReason,
        stall_switches: stallSwitches,
        final_min_edge: AUTO_TUNE_LEVELS[records.length > 0 ? AUTO_TUNE_LEVELS.findIndex(l => l <= records[records.length-1].min_edge_used) : 0],
        tickers_used: selectedTickers.filter(t => t.samplesCount > 0).map(t => ({ ticker: t.ticker, valid_quotes: t.validQuotes, samples: t.samplesCount })),
        dedupe_mode: records.length >= CONFIG.samples - 2 ? 'pair_id:side:bucket' : 'pair_id:side',
        unique_pairs: uniquePairs.size,
        unique_pair_sides: uniquePairSides.size,
        model_A: {
            fill_rate: records.length ? (filledA.length / records.length).toFixed(3) : 0,
            reasons: records.reduce((acc: any, r) => { acc[r.result_A.reason_code] = (acc[r.result_A.reason_code] || 0) + 1; return acc; }, {})
        },
        model_B: {
            fill_rate: records.length ? (filledB.length / records.length).toFixed(3) : 0,
            reasons: records.reduce((acc: any, r) => { acc[r.result_B.reason_code] = (acc[r.result_B.reason_code] || 0) + 1; return acc; }, {})
        },
        diff: {
            count: records.filter(r => r.result_A.filled !== r.result_B.filled).length,
        }
    };

    const jsonPath = path.join(CONFIG.outputDir, `queue_ab_acceptance_${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

    console.log(`\n=== Report Generated ===`);
    console.log(`Stop Reason: ${stopReason}`);
    console.log(`Samples: ${records.length}/${CONFIG.samples} | Unique: ${uniquePairs.size}`);
    console.log(`Tickers: ${summary.tickers_used.map(t => `${t.ticker}(${t.samples})`).join(', ')}`);
    console.log(`Fill Rates: A=${summary.model_A.fill_rate} | B=${summary.model_B.fill_rate} | DiffCount=${summary.diff.count}`);
    console.log(`Report: ${jsonPath}`);
    
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
