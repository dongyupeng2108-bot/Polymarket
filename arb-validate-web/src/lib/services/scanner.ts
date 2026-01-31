
import { prisma } from '../db';
import { fetchAndSaveSnapshot } from './snapshot';
import { evaluateOpportunity } from './engine/evaluator';
import { getRuntimeConfig } from '../config/runtime';
import { simulateTrade, SimulationResult } from '../sim/simulate';
import { lightVerifyGate } from './light-verify';

export interface ScanResult {
    pair_id: number;
    timestamp: string;
    status: 'ok' | 'fail';
    result: 'OPPORTUNITY' | 'NO_OPPORTUNITY' | 'ERROR';
    reason?: string;
    reason_code?: string;
    prices: {
        pm_bid: number | null;
        pm_ask: number | null;
        kh_bid: number | null;
        kh_ask: number | null;
    };
    edge_raw?: number | null;
    threshold: string;
    debug_stats: {
        pm: any;
        kh: any;
    };
    simulation?: SimulationResult;
    error?: string;
    market_data?: {
        pm: { bids: {price: number, size: number}[], asks: {price: number, size: number}[] };
        kh: { bids: {price: number, size: number}[], asks: {price: number, size: number}[] };
    };
    tickers?: {
        pm: { yes: string | null, no: string | null };
        kh: string | null;
    };
}

export async function scanPairs(pairIds: number[], concurrency: number = 5, overrides?: { minEdge?: number }): Promise<ScanResult[]> {
    const results: ScanResult[] = new Array(pairIds.length);
    const iterator = pairIds.entries();
    
    // Create workers
    const workers = new Array(Math.min(concurrency, pairIds.length)).fill(0).map(async () => {
        for (const [index, pairId] of iterator) {
            results[index] = await scanPair(pairId, 1, overrides);
        }
    });

    await Promise.all(workers);
    return results;
}

export async function scanPair(pairId: number, attempt = 1, overrides?: { minEdge?: number }): Promise<ScanResult> {
    try {
        const pair = await prisma.pair.findUnique({ where: { id: pairId } });
        if (!pair) {
            throw new Error(`Pair ${pairId} not found`);
        }

        // Enforce VERIFIED status check
        if (pair.status !== 'verified') {
             return {
                pair_id: pairId,
                timestamp: new Date().toISOString(),
                status: 'ok', 
                result: 'NO_OPPORTUNITY',
                reason: 'Pair not verified',
                reason_code: 'PAIR_NOT_VERIFIED',
                prices: { pm_bid: null, pm_ask: null, kh_bid: null, kh_ask: null },
                threshold: 'unknown',
                debug_stats: { pm: {}, kh: {} }
             };
        }

        // --- Light Verification Gate ---
        const gate = await lightVerifyGate(pairId);
        if (gate.status === 'FAIL_UNVERIFIED') {
             return {
                pair_id: pairId,
                timestamp: new Date().toISOString(),
                status: 'fail',
                result: 'ERROR',
                reason: gate.reason || 'Verification Failed',
                reason_code: 'VERIFY_HARD_FAIL',
                prices: { pm_bid: null, pm_ask: null, kh_bid: null, kh_ask: null },
                threshold: 'unknown',
                debug_stats: { pm: {}, kh: {} },
                error: gate.reason
             };
        } else if (gate.status === 'SKIP') {
             return {
                pair_id: pairId,
                timestamp: new Date().toISOString(),
                status: 'ok', 
                result: 'NO_OPPORTUNITY',
                reason: gate.reason || 'Light Verify Soft Fail',
                reason_code: 'VERIFY_SOFT_FAIL',
                prices: { pm_bid: null, pm_ask: null, kh_bid: null, kh_ask: null },
                threshold: 'unknown',
                debug_stats: { pm: {}, kh: {} }
             };
        }
        // --- End Gate ---
        
        // 1. Fetch & Snapshot with Retry (Exponential Backoff)
        let result = null;
        const maxRetries = 2; // Total 3 attempts
        let lastError: any = null;
        
        for (let i = 0; i <= maxRetries; i++) {
             try {
                 result = await fetchAndSaveSnapshot(pairId);
                 if (result) break; // Success
                 lastError = new Error('Snapshot returned null');
             } catch (fetchErr) {
                 lastError = fetchErr;
                 console.warn(`[ScanService] Fetch attempt ${i+1} failed for Pair ${pairId}:`, fetchErr);
             }
             
             if (i < maxRetries) {
                 // Exponential backoff: 500ms, 1000ms, 2000ms
                 const delay = 500 * Math.pow(2, i);
                 await new Promise(r => setTimeout(r, delay));
             }
        }
        
        if (!result) {
             throw lastError || new Error('Snapshot failed after retries (network/id error)');
        }
        
        // 2. Evaluate
        await evaluateOpportunity(result.snapshot, result.debug, overrides);
        
        // 3. Get latest evaluation result
        const evaluation = await prisma.evaluation.findFirst({
            where: { snapshot_id: result.snapshot.id },
            orderBy: { id: 'desc' }
        });
        
        // 4. Run Simulation (M1)
        const pm_bid = evaluation?.pm_price_bid ?? null;
        const pm_ask = evaluation?.pm_price_ask ?? null;
        const kh_bid = evaluation?.kh_price_bid ?? null;
        const kh_ask = evaluation?.kh_price_ask ?? null;
        
        const simulation = simulateTrade({
            pm_bid, pm_ask, kh_bid, kh_ask,
            pm_latency_ms: result.debug.pm.latency_ms,
            kh_latency_ms: result.debug.kh.latency_ms
        });
        
        // 5. Return structured summary
        const config = getRuntimeConfig();
        
        return {
            pair_id: pair.id,
            timestamp: new Date().toISOString(),
            status: 'ok',
            result: evaluation?.is_opportunity ? 'OPPORTUNITY' : 'NO_OPPORTUNITY',
            reason: evaluation?.reason || undefined,
            reason_code: evaluation?.reason_code || undefined,
            prices: {
                pm_bid, pm_ask, kh_bid, kh_ask
            },
            tickers: {
                pm: { yes: pair.pm_yes_token_id, no: pair.pm_no_token_id },
                kh: pair.kh_ticker
            },
            edge_raw: evaluation?.edge_raw ?? null,
            threshold: config.opp_threshold.toString(),
            debug_stats: {
                pm: {
                    http_status: result.debug.pm.http_status,
                    latency_ms: result.debug.pm.latency_ms,
                    error_class: result.debug.pm.error_class,
                    error_code: result.debug.pm.error_code,
                    proxy_used: result.debug.pm.proxy_used
                },
                kh: {
                    http_status: result.debug.kh.http_status,
                    latency_ms: result.debug.kh.latency_ms,
                    error_class: result.debug.kh.error_class,
                    error_code: result.debug.kh.error_code,
                    proxy_used: result.debug.kh.proxy_used
                }
            },
            simulation,
            market_data: {
                pm: {
                    bids: result.debug.pm.parsed_book?.bids?.slice(0, 10) || [],
                    asks: result.debug.pm.parsed_book?.asks?.slice(0, 10) || []
                },
                kh: {
                    bids: result.debug.kh.parsed_book?.bids?.slice(0, 10) || [],
                    asks: result.debug.kh.parsed_book?.asks?.slice(0, 10) || []
                }
            }
        };
        
    } catch (e: any) {
        console.error(`[ScanService] Pair ${pairId}`, e);
        return {
            pair_id: pairId,
            timestamp: new Date().toISOString(),
            status: 'fail',
            result: 'ERROR',
            reason: e.message || 'Unknown scan error',
            prices: { pm_bid: null, pm_ask: null, kh_bid: null, kh_ask: null },
            threshold: 'unknown',
            debug_stats: { pm: {}, kh: {} },
            error: e.message
        };
    }
}
