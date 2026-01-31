
import { prisma } from '../db';
import { getPolymarketMarket } from '../adapters/polymarket';
import { getKalshiMarket } from '../adapters/kalshi';

const LIGHT_CHECK_TTL_MS = 15 * 60 * 1000; // 15 minutes

export type LightVerifyResult = 'PASS' | 'SKIP' | 'FAIL_UNVERIFIED';

export async function lightVerifyGate(pairId: number, options?: { force?: boolean; dryRun?: boolean }): Promise<{ status: LightVerifyResult; reason?: string }> {
    // 1. Check Global Settings
    const settings = await prisma.settings.findFirst();
    if (settings && !settings.light_verify_enabled) {
        return { status: 'PASS' }; // Gate disabled
    }

    const pair = await prisma.pair.findUnique({ where: { id: pairId } });
    if (!pair) return { status: 'SKIP', reason: 'PAIR_NOT_FOUND' };

    // Only verify VERIFIED pairs
    // If pair is not verified, we pass (gate logic does not apply, or caller handles)
    if (pair.status !== 'verified') {
        return { status: 'PASS' };
    }

    // Check TTL (unless forced)
    if (!options?.force && pair.last_light_check_at) {
        const diff = Date.now() - pair.last_light_check_at.getTime();
        if (diff < LIGHT_CHECK_TTL_MS) {
            return { status: 'PASS' };
        }
    }

    // Perform Check
    try {
        if (options?.dryRun) {
            console.log(`[LightVerify] (DryRun) Verifying #${pairId} (${pair.title_pm})...`);
        } else {
            console.log(`[LightVerify] Verifying #${pairId} (${pair.title_pm})...`);
        }

        // Parallel Check
        // Note: getPolymarketMarket and getKalshiMarket return null on Hard Fail (404/400).
        // They throw on Soft Fail (Network).
        
        // Ensure IDs exist
        if (!pair.pm_market_id) throw new Error('Missing PM Market ID (Hard)');
        if (!pair.kh_ticker) throw new Error('Missing KH Ticker (Hard)');

        const [pm, kh] = await Promise.all([
            getPolymarketMarket(pair.pm_market_id),
            getKalshiMarket(pair.kh_ticker)
        ]);

        const failures: string[] = [];
        
        if (!pm) {
            failures.push(`PM Market Not Found (ID: ${pair.pm_market_id})`);
        } else if (pm.closed) {
             failures.push(`PM Market Closed`);
        }

        if (!kh) {
            failures.push(`Kalshi Market Not Found (Ticker: ${pair.kh_ticker})`);
        } else if (kh.status !== 'active' && kh.status !== 'open') { 
             failures.push(`Kalshi Market Status: ${kh.status}`);
        }

        if (failures.length > 0) {
            const reason = failures.join('; ');
            console.warn(`[LightVerify] FAIL #${pairId}: ${reason}`);
            
            if (!options?.dryRun) {
                const failLimit = settings?.failure_demotion_count ?? 1;
                const newFailCount = (pair.consecutive_verify_failures || 0) + 1;
                
                const updateData: any = {
                    consecutive_verify_failures: newFailCount,
                    verify_fail_reason: reason
                };

                if (newFailCount >= failLimit) {
                    updateData.status = 'unverified';
                }

                await prisma.pair.update({
                    where: { id: pairId },
                    data: updateData
                });
            }
            return { status: 'FAIL_UNVERIFIED', reason };
        }

        // Pass
        if (!options?.dryRun) {
            await prisma.pair.update({
                where: { id: pairId },
                data: {
                    last_light_check_at: new Date(),
                    verify_fail_reason: null, // Clear previous errors
                    consecutive_verify_failures: 0 // Reset counter
                }
            });
        }
        return { status: 'PASS' };

    } catch (e: any) {
        // Distinguish Hard vs Soft Error from explicit throws
        if (e.message.includes('(Hard)')) {
             const reason = e.message;
             if (!options?.dryRun) {
                 await prisma.pair.update({
                    where: { id: pairId },
                    data: {
                        status: 'unverified',
                        verify_fail_reason: reason,
                    }
                });
            }
            return { status: 'FAIL_UNVERIFIED', reason };
        }

        // Soft Fail (Network Error)
        console.warn(`[LightVerify] Soft Fail for #${pairId}: ${e.message}`);
        // Return SKIP
        return { status: 'SKIP', reason: `TEMP_ERROR: ${e.message}` };
    }
}
