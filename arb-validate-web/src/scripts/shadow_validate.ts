
import fs from 'fs';
import path from 'path';
import { setupGlobalProxy, getFetchDispatcher } from '../lib/global-proxy';
import { ScanResult } from '../lib/services/scanner';

// Initialize Global Proxy
setupGlobalProxy();
import { PolymarketWS } from '../lib/ws/polymarket';
import { KalshiWS } from '../lib/ws/kalshi';
import { QueueFillSimulator } from '../lib/fill/queueFillSimulator';

// --- Configuration ---
const ARGS = process.argv.slice(2);
const getArg = (name: string, defaultVal: string) => {
    const idx = ARGS.indexOf(name);
    return idx !== -1 && ARGS[idx + 1] ? ARGS[idx + 1] : defaultVal;
};

// Unified Base URL logic
const BASE_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || 'http://localhost:53121';

const CONFIG = {
    loops: parseInt(getArg('--loops', '20'), 10),
    intervalMs: parseInt(getArg('--interval_ms', '2000'), 10),
    ttlSec: parseInt(getArg('--ttl_sec', '900'), 10), // 15 min default
    minEdge: getArg('--min_edge', '0.01'),
    eventTicker: getArg('--eventTicker', 'KXFEDCHAIRNOM'),
    apiUrl: `${BASE_URL}/api/scan/batch`,
    fillModel: getArg('--fill_model', 'queue_trade_real'), // touch | queue_trade_real
    cancelWeight: parseFloat(getArg('--cancel_weight', '0.3')),
    queueBuffer: parseFloat(getArg('--queue_buffer', '0.0'))
};

console.log(`\n[Shadow] Configuration:`);
console.log(`  BaseUrl:   ${BASE_URL}`);
console.log(`  ScanUrl:   ${CONFIG.apiUrl}`);
console.log(`  Loops:     ${CONFIG.loops} (Max recommended: 50)`);
console.log(`  Ticker:    ${CONFIG.eventTicker}`);
console.log(`  Mode:      Query Params (default)`); // Currently code uses query params

if (CONFIG.loops > 50) {
    console.warn(`\n[Shadow] WARNING: Loops > 50 (${CONFIG.loops}) is high. Recommended <= 50.`);
}


// --- Types ---
type OrderStatus = 'OPEN' | 'FILLED' | 'EXPIRED' | 'NOT_FILLED_WITHIN_T';

interface ShadowOrder {
    id: string; // Unique ID (pairId + timestamp)
    pairId: number;
    direction: "BUY_PM_SELL_KH" | "BUY_KH_SELL_PM";
    limit_price: number; // The price we want to trade at (Shadow Leg)
    size: number;
    created_at: number; // timestamp ms
    ttl_at: number; // timestamp ms
    status: OrderStatus;
    
    // Fill Info
    fill_timestamp?: number;
    time_to_fill_ms?: number;
    
    // Hedge Info (recorded at fill time)
    hedge_leg_price_ref: number; // The price of the hedge leg at signal time (for slippage calc)
    hedge_vwap_est?: number;
    hedge_slippage_est?: number;
    hedge_depth_ok?: boolean;
    hedge_fail_reason?: string;

    // Sim Stats
    sim_stats?: {
        fill_model: string;
        queue_ahead0: number;
        effective_progress: number;
        cum_trade: number;
        cum_ob_removed: number;
        fill_confidence: number;
    };
}

interface BatchResponse {
    results: ScanResult[];
}

// --- State ---
const openOrders: Map<string, ShadowOrder> = new Map(); // key: specific key -> Order
const completedOrders: ShadowOrder[] = [];
let totalOpportunitiesSeen = 0;
let ordersCreated = 0;

// Simulation State
const simulators = new Map<string, QueueFillSimulator>(); // orderId -> Simulator
const tickerMap = new Map<number, { pm: { yes: string | null, no: string | null }, kh: string | null }>();
const pmObSizes = new Map<string, Map<string, number>>(); // asset_id -> price(str) -> size

// WS Clients
let pmWS: PolymarketWS | null = null;
let khWS: KalshiWS | null = null;

// --- Helpers ---
function generateKey(pairId: number, direction: string, limitPrice: number): string {
    // Round price to 4 decimals to be stable
    const p = Math.round(limitPrice * 10000) / 10000;
    return `${pairId}-${direction}-${p}`;
}

function generateId(pairId: number): string {
    return `${pairId}-${Date.now()}`;
}

function calculateVwap(depth: {price: number, size: number}[], targetSize: number): { vwap: number, filledSize: number, full: boolean } {
    let remaining = targetSize;
    let totalCost = 0;
    let filled = 0;

    for (const level of depth) {
        const take = Math.min(remaining, level.size);
        totalCost += take * level.price;
        filled += take;
        remaining -= take;
        if (remaining <= 0.0001) break;
    }

    if (filled === 0) return { vwap: 0, filledSize: 0, full: false };
    
    return {
        vwap: totalCost / filled,
        filledSize: filled,
        full: remaining <= 0.0001
    };
}

// --- Main ---
async function main() {
    console.log(`[Shadow] CWD=${process.cwd()}`);
    console.log(`[Shadow] baseUrl=${BASE_URL}`);
    console.log(`[Shadow] Starting... Loops=${CONFIG.loops}, Interval=${CONFIG.intervalMs}ms, TTL=${CONFIG.ttlSec}s`);
    console.log(`[Shadow] FillModel=${CONFIG.fillModel}, CancelWeight=${CONFIG.cancelWeight}, QueueBuffer=${CONFIG.queueBuffer}`);

    // Initial Fetch to setup WS if needed
    if (CONFIG.fillModel === 'queue_trade_real') {
        await setupWebSockets();
    }

    for (let i = 0; i < CONFIG.loops; i++) {
        const iterStart = Date.now();
        process.stdout.write(`\r[${i + 1}/${CONFIG.loops}] Active: ${openOrders.size} | Created: ${ordersCreated} | Filled: ${completedOrders.filter(o => o.status === 'FILLED').length} `);

        try {
            // 1. Fetch Batch
            const fetchUrl = `${CONFIG.apiUrl}?eventTicker=${CONFIG.eventTicker}&limit=100&min_edge=${CONFIG.minEdge}`;
            if (i === 0 || i % 10 === 0) console.log(`\n[Shadow] Fetching: ${fetchUrl}`);
            
            const res = await fetch(fetchUrl, { 
                method: 'POST',
                dispatcher: getFetchDispatcher(fetchUrl)
            } as any);
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} from ${fetchUrl}`);
            const data = await res.json() as BatchResponse;
            const now = Date.now();

            // 2. Process Data
            if (!data.results || data.results.length === 0) {
                 if (i % 5 === 0) process.stdout.write(' (0 results) ');
            }

            if (data.results) {
                // Map for quick lookup of current market data
                const marketMap = new Map<number, ScanResult>();
                data.results.forEach(r => {
                    marketMap.set(r.pair_id, r);
                    // Update ticker map if new
                    if (!tickerMap.has(r.pair_id) && r.tickers) {
                        tickerMap.set(r.pair_id, r.tickers);
                    }
                });

                // A. Check Open Orders (Fill Logic)
                for (const [key, order] of openOrders.entries()) {
                    // Check TTL
                    if (now > order.ttl_at) {
                        order.status = 'NOT_FILLED_WITHIN_T';
                        finalizeOrder(order, key);
                        continue;
                    }

                    const market = marketMap.get(order.pairId);
                    
                    let filled = false;
                    let filledSize = 0; // Track partial fills if supported by logic, for now binary

                    // --- TOUCH MODEL ---
                    if (CONFIG.fillModel === 'touch') {
                         if (!market || !market.market_data) continue;
                         
                         if (order.direction === 'BUY_PM_SELL_KH') {
                             const bestAsk = market.market_data.pm.asks[0]?.price;
                             if (bestAsk !== undefined && bestAsk <= order.limit_price) {
                                 filled = true;
                             }
                         } else if (order.direction === 'BUY_KH_SELL_PM') {
                              const bestAsk = market.market_data.kh.asks[0]?.price;
                              if (bestAsk !== undefined && bestAsk <= order.limit_price) {
                                  filled = true;
                              }
                         }
                    } 
                    // --- QUEUE MODEL ---
                    else if (CONFIG.fillModel === 'queue_trade_real') {
                        const sim = simulators.get(order.id);
                        if (sim) {
                            const status = sim.getFillStatus(CONFIG.cancelWeight, CONFIG.queueBuffer);
                            
                            // Update order stats for reporting
                            order.sim_stats = {
                                fill_model: 'queue_trade_real',
                                queue_ahead0: (sim as any).queueAhead0, 
                                effective_progress: status.effectiveProgress,
                                cum_trade: status.cumTradeAtP,
                                cum_ob_removed: status.cumObRemovedAtP,
                                fill_confidence: status.fillConfidence
                            };

                            if (status.isFilled) {
                                filled = true;
                            }
                        }
                    }

                    if (filled) {
                        order.status = 'FILLED';
                        order.fill_timestamp = now;
                        order.time_to_fill_ms = now - order.created_at;

                        // Calculate Hedge Friction
                        if (market && market.market_data) {
                            let hedgeDepth: {price: number, size: number}[] = [];
                            
                            if (order.direction === 'BUY_PM_SELL_KH') {
                                hedgeDepth = market.market_data.kh.bids;
                            } else {
                                hedgeDepth = market.market_data.pm.bids;
                            }

                            if (hedgeDepth.length === 0) {
                                order.hedge_fail_reason = 'HEDGE_API_FAIL'; 
                                order.hedge_depth_ok = false;
                            } else {
                                const { vwap, full } = calculateVwap(hedgeDepth, order.size);
                                order.hedge_vwap_est = vwap;
                                order.hedge_depth_ok = full;
                                order.hedge_slippage_est = order.hedge_leg_price_ref - vwap;
                            }
                        } else {
                            order.hedge_fail_reason = 'NO_SNAPSHOT_FOR_HEDGE';
                            order.hedge_depth_ok = false;
                        }

                        finalizeOrder(order, key);
                    }
                }

                // B. Create New Orders
                for (const r of data.results) {
                    if (r.result === 'OPPORTUNITY' && r.simulation?.tradeable) {
                        totalOpportunitiesSeen++;
                        
                        const sim = r.simulation;
                        const direction = sim.direction;
                        const size = sim.max_size_at_top || 10;

                        let limitPrice = 0;
                        let hedgeRef = 0;

                        if (direction === 'BUY_PM_SELL_KH') {
                            limitPrice = r.prices.pm_ask || 0;
                            hedgeRef = r.prices.kh_bid || 0;
                        } else if (direction === 'BUY_KH_SELL_PM') {
                            limitPrice = r.prices.kh_ask || 0;
                            hedgeRef = r.prices.pm_bid || 0;
                        } else {
                            continue;
                        }

                        if (limitPrice === 0 || hedgeRef === 0) continue;

                        const orderKey = generateKey(r.pair_id, direction, limitPrice);
                        if (openOrders.has(orderKey)) continue;

                        const newOrder: ShadowOrder = {
                            id: generateId(r.pair_id),
                            pairId: r.pair_id,
                            direction: direction as any,
                            limit_price: limitPrice,
                            size: size,
                            created_at: now,
                            ttl_at: now + (CONFIG.ttlSec * 1000),
                            status: 'OPEN',
                            hedge_leg_price_ref: hedgeRef
                        };

                        // Init Simulator if needed
                        if (CONFIG.fillModel === 'queue_trade_real') {
                            let queueAhead0 = 0;
                            let side = ''; // Simulator Side: BUY/SELL (PM), YES/NO (KH)
                            
                            if (direction === 'BUY_PM_SELL_KH') {
                                // We are Buying PM. 
                                // "挂单要先排队". Implies Maker.
                                // If limit_price matches Ask, queueAhead0 on Bid side at that price is 0.
                                // If limit_price matches Bid, queueAhead0 is sum of bids at that price.
                                // Usually if we hit opportunity, we are Taker on Maker's Ask.
                                // But Shadow Mode assumes WE are placing a Limit Order to capture spread?
                                // "Shadow Mode: Tracks shadow orders (limit orders)".
                                // So we are placing a Bid at `pm_ask`? No, if we want to buy, we place Bid.
                                // If opportunity is "Buy PM @ Ask < Sell KH @ Bid", we can Take.
                                // But Shadow Mode is about "Limit Order" strategy or "Passive"?
                                // User said: "挂单要先排队". So we are placing a Limit Order.
                                // At what price? `limitPrice = r.prices.pm_ask` (line 249).
                                // If we place Bid at Ask Price, we are crossing spread (Taker).
                                // But maybe the market is fast and we are joining the Bid?
                                // If we are joining the Best Bid, price should be `pm_bid`.
                                // If we are joining Best Ask? No.
                                // Let's assume we place order at `limitPrice` which is the Opportunity Price.
                                // If `pm_ask` is the opportunity price, it means we want to Buy at `pm_ask`.
                                // If it's a Taker strategy, we fill immediately if liquidity exists.
                                // But User wants "Queue + Trade" simulation.
                                // This implies we are joining a queue.
                                // So `queueAhead0` should be the size at that price level.
                                // If we are Buying, we look at Bids.
                                // If `limitPrice` is currently the Best Ask, then Bids at that price are 0 (usually).
                                // Unless it's a crossed market or we are placing a Bid at Ask price (immediate fill?).
                                // User said: "queue_ahead0（挂单瞬间该价位同侧聚合量）".
                                
                                side = 'BUY'; // PM Buy
                                const bids = r.market_data?.pm.bids || [];
                                const level = bids.find(b => b.price === limitPrice);
                                queueAhead0 = level ? level.size : 0;
                                
                            } else {
                                // BUY_KH_SELL_PM -> Buy KH.
                                side = 'YES'; // Assuming we buy YES
                                
                                const bids = r.market_data?.kh.bids || [];
                                const level = bids.find(b => b.price === limitPrice);
                                queueAhead0 = level ? level.size : 0;
                            }

                            const sim = new QueueFillSimulator(size, limitPrice, side, queueAhead0, now);
                            simulators.set(newOrder.id, sim);
                            
                            newOrder.sim_stats = {
                                fill_model: 'queue_trade_real',
                                queue_ahead0: queueAhead0,
                                effective_progress: 0,
                                cum_trade: 0,
                                cum_ob_removed: 0,
                                fill_confidence: 0
                            };
                        }

                        openOrders.set(orderKey, newOrder);
                        ordersCreated++;
                    }
                }
            }

        } catch (e: any) {
            const msg = e.message || '';
            if (msg.includes('fetch failed') || (e.cause && (e.cause.code === 'ECONNREFUSED' || e.cause.code === 'ETIMEDOUT'))) {
                 console.error(`\n[Shadow] Data Source Unreachable: ${msg}`);
                 console.error(`Hint: Check if Web Service is running on Port 53121. Run 'npm run dev' first.`);
                 console.error(`[Shadow] Stopping loop early.`);
                 break;
            } else {
                 console.error(`\n[Shadow] Err: ${msg}`);
            }
        }

        const elapsed = Date.now() - iterStart;
        const wait = Math.max(0, CONFIG.intervalMs - elapsed);
        if (i < CONFIG.loops - 1) await new Promise(r => setTimeout(r, wait));
    }

    console.log('\n[Shadow] Loop complete. Generating report...');
    generateReport();
    
    // Cleanup WS
    if (pmWS) pmWS.close();
    if (khWS) khWS.close();
}

function finalizeOrder(order: ShadowOrder, key: string) {
    completedOrders.push(order);
    openOrders.delete(key);
    simulators.delete(order.id);
}

async function setupWebSockets() {
    console.log('[Shadow] Fetching pairs for WS subscription...');
    try {
        const fetchUrl = `${CONFIG.apiUrl}?eventTicker=${CONFIG.eventTicker}&limit=100`;
        const res = await fetch(fetchUrl, {
            method: 'POST',
            dispatcher: getFetchDispatcher(fetchUrl)
        } as any);
        if (!res.ok) throw new Error(`Failed to fetch initial batch: HTTP ${res.status} from ${fetchUrl}`);
        const data = await res.json() as BatchResponse;
        
        const pmAssets: string[] = [];
        const khTickers: string[] = [];
        
        data.results.forEach(r => {
            if (r.tickers) {
                tickerMap.set(r.pair_id, r.tickers);
                if (r.tickers.pm.yes) pmAssets.push(r.tickers.pm.yes);
                if (r.tickers.pm.no) pmAssets.push(r.tickers.pm.no);
                if (r.tickers.kh) khTickers.push(r.tickers.kh);
            }
        });

        // Unique
        const uniquePm = [...new Set(pmAssets)];
        const uniqueKh = [...new Set(khTickers)];
        
        console.log(`[Shadow] Subscribing PM: ${uniquePm.length} assets, KH: ${uniqueKh.length} tickers`);

        if (uniquePm.length > 0) {
            try {
                pmWS = new PolymarketWS(uniquePm);
                pmWS.on('trade', (t) => {
                    openOrders.forEach(order => {
                       const tickers = tickerMap.get(order.pairId);
                       if (!tickers) return;
                       // PM Order?
                       if (order.direction === 'BUY_PM_SELL_KH') { 
                           // Assume YES token
                           if (t.asset_id === tickers.pm.yes) {
                               const sim = simulators.get(order.id);
                               if (sim) sim.onTrade(parseFloat(t.size), parseFloat(t.price), t.side, parseInt(t.timestamp));
                           }
                       }
                    });
                });
                pmWS.on('price_change', (pc) => {
                    // Update local state for delta calculation
                    if (!pmObSizes.has(pc.asset_id)) {
                        pmObSizes.set(pc.asset_id, new Map());
                    }
                    const assetMap = pmObSizes.get(pc.asset_id)!;
                    
                    const oldSize = assetMap.get(pc.price) || 0;
                    const newSize = parseFloat(pc.size);
                    const delta = newSize - oldSize;
                    
                    assetMap.set(pc.price, newSize);
                    
                    // Only process if delta != 0
                    if (delta !== 0) {
                        openOrders.forEach(order => {
                            const tickers = tickerMap.get(order.pairId);
                            if (!tickers) return;
                            if (order.direction === 'BUY_PM_SELL_KH' && pc.asset_id === tickers.pm.yes) {
                                 const sim = simulators.get(order.id);
                                 if (sim) sim.onObDelta(delta, parseFloat(pc.price), pc.side);
                            }
                        });
                    }
                });
                pmWS.on('error', (e) => {
                    console.error('[Shadow] PM WS Error (handled):', e.message);
                });
                pmWS.connect();
            } catch (e: any) {
                console.error(`[Shadow] PM WS Init Failed: ${e.message}. Running in degraded mode.`);
            }
        }

        if (uniqueKh.length > 0) {
            try {
                khWS = new KalshiWS(uniqueKh);
                khWS.on('trade', (t) => {
                     openOrders.forEach(order => {
                        const tickers = tickerMap.get(order.pairId);
                        if (!tickers || tickers.kh !== t.ticker) return; 
                        if (order.direction === 'BUY_KH_SELL_PM') {
                            const sim = simulators.get(order.id);
                            if (sim) {
                                // Map KH trade to generic trade
                                // t.taker_side, t.count, t.yes_price
                                // If YES Bid, we want NO Taker.
                                sim.onTrade(t.count, t.yes_price, t.taker_side, t.ts * 1000); 
                            }
                        }
                     });
                });
                khWS.on('orderbook_delta', (d) => {
                     // Not implemented for KH yet in this snippet
                });
                khWS.on('error', (e) => {
                    console.error('[Shadow] KH WS Error (handled):', e.message);
                });
                khWS.connect();
            } catch (e: any) {
                console.error(`[Shadow] KH WS Init Failed: ${e.message}. Running in degraded mode.`);
            }
        }

    } catch (e: any) {
        console.error(`[Shadow] Failed to setup WebSockets: ${e.message}. Running in degraded mode (no real-time fills).`);
    }
}

function generateReport() {
    const filled = completedOrders.filter(o => o.status === 'FILLED');
    const failed = completedOrders.filter(o => o.status !== 'FILLED');
    
    // 1. P_Fill Buckets (TTF)
    const ttfBuckets = { '<1s': 0, '<5s': 0, '<15s': 0, '<1m': 0, '>1m': 0 };
    const ttfs = filled.map(o => o.time_to_fill_ms || 0).sort((a, b) => a - b);
    ttfs.forEach(t => {
        if (t < 1000) ttfBuckets['<1s']++;
        else if (t < 5000) ttfBuckets['<5s']++;
        else if (t < 15000) ttfBuckets['<15s']++;
        else if (t < 60000) ttfBuckets['<1m']++;
        else ttfBuckets['>1m']++;
    });
    const p50_ttf = ttfs.length ? ttfs[Math.floor(ttfs.length * 0.5)] : 0;
    const p90_ttf = ttfs.length ? ttfs[Math.floor(ttfs.length * 0.9)] : 0;

    // 2. Hedge Slippage
    const slippages = filled.map(o => o.hedge_slippage_est || 0).sort((a, b) => a - b);
    const p50_slip = slippages.length ? slippages[Math.floor(slippages.length * 0.5)] : 0;
    
    // 3. Reasons
    const reasons: Record<string, number> = {};
    failed.forEach(o => reasons[o.status] = (reasons[o.status] || 0) + 1);
    openOrders.forEach(() => reasons['STILL_OPEN'] = (reasons['STILL_OPEN'] || 0) + 1);

    const ordersCreatedCount = completedOrders.length + openOrders.size;
    const fillRate = ordersCreatedCount > 0 ? filled.length / ordersCreatedCount : 0;

    const report = {
        meta: {
            timestamp: new Date().toISOString(),
            fill_model: CONFIG.fillModel,
            cancel_weight: CONFIG.cancelWeight,
            queue_buffer: CONFIG.queueBuffer,
            min_edge: CONFIG.minEdge,
            loops: CONFIG.loops,
            interval_ms: CONFIG.intervalMs
        },
        stats: {
            total_orders: ordersCreatedCount,
            filled_count: filled.length,
            fill_rate: fillRate.toFixed(4),
            ttf_p50_ms: p50_ttf,
            ttf_p90_ms: p90_ttf,
            hedge_slippage_p50: p50_slip,
            ttf_dist: ttfBuckets,
            fail_reasons: reasons
        },
        orders: [...filled, ...failed]
    };

    // Output JSON
    const jsonPath = path.resolve('out', 'shadow_report.json');
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
    console.log(`[Shadow] Report saved to ${jsonPath}`);

    // Output CSV
    const csvHeader = 'id,pairId,direction,limit_price,size,status,created_at,fill_timestamp,ttf_ms,hedge_slippage,fill_model,queue_ahead0,effective_progress,cum_trade,cum_ob_removed,fill_confidence\n';
    const csvRows = [...filled, ...failed].map(o => {
        return [
            o.id,
            o.pairId,
            o.direction,
            o.limit_price,
            o.size,
            o.status,
            new Date(o.created_at).toISOString(),
            o.fill_timestamp ? new Date(o.fill_timestamp).toISOString() : '',
            o.time_to_fill_ms || '',
            o.hedge_slippage_est || '',
            o.sim_stats?.fill_model || '',
            o.sim_stats?.queue_ahead0 || '',
            o.sim_stats?.effective_progress || '',
            o.sim_stats?.cum_trade || '',
            o.sim_stats?.cum_ob_removed || '',
            o.sim_stats?.fill_confidence || ''
        ].join(',');
    });
    const csvPath = path.resolve('out', 'shadow_report.csv');
    fs.writeFileSync(csvPath, csvHeader + csvRows.join('\n'));
    console.log(`[Shadow] CSV saved to ${csvPath}`);
}

main().catch(console.error);
