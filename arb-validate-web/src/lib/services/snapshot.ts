import { prisma } from '../db';
import { fetchPolymarketBookDebug } from '../adapters/polymarket';
import { fetchKalshiBookDebug } from '../adapters/kalshi';
import { MarketOrderBook, FetchDebugResult } from '../types';

export interface SnapshotResult {
    snapshot: any; // Prisma model type
    debug: {
        pm: FetchDebugResult;
        kh: FetchDebugResult;
    }
}

export async function fetchAndSaveSnapshot(pairId: number): Promise<SnapshotResult | null> {
  const pair = await prisma.pair.findUnique({ where: { id: pairId } });
  if (!pair) return null;

  // Strict ID check: Only scan if we have locked IDs
  if (!pair.pm_yes_token_id || !pair.kh_ticker) {
      console.log(`[Snapshot] Skipping Pair #${pair.id}: Missing locked IDs (PM: ${pair.pm_yes_token_id}, KH: ${pair.kh_ticker})`);
      return null;
  }

  console.log(`[Snapshot] Fetching for Pair #${pair.id}: ${pair.title_pm}`);

  try {
    const [pmResult, khResult] = await Promise.all([
      fetchPolymarketBookDebug(pair.pm_yes_token_id),
      fetchKalshiBookDebug(pair.kh_ticker),
    ]);

    const pmBook = pmResult.parsed_book;
    const khBook = khResult.parsed_book;

    // Helper to get best prices safely
    const bestBid = (book: MarketOrderBook) => book.bids.length > 0 ? book.bids[0].price : null;
    const bestAsk = (book: MarketOrderBook) => book.asks.length > 0 ? book.asks[0].price : null;

    // TODO: Fetch NO book if pm_no_token_id is present?
    // For now, MVP assumes binary YES analysis.

    const snapshot = await prisma.snapshot.create({
      data: {
        pair_id: pair.id,
        pm_book: pmBook as any, 
        kh_book: khBook as any,
        pm_best_yes_bid: bestBid(pmBook),
        pm_best_yes_ask: bestAsk(pmBook),
        kh_best_yes_bid: bestBid(khBook),
        kh_best_yes_ask: bestAsk(khBook)
      },
    });

    console.log(`[Snapshot] Saved #${snapshot.id}`);
    
    return {
        snapshot,
        debug: {
            pm: pmResult,
            kh: khResult
        }
    };
  } catch (error) {
    console.error(`[Snapshot] Failed for Pair #${pair.id}`, error);
    // We should probably record the error in system status or pair notes
    return null;
  }
}
