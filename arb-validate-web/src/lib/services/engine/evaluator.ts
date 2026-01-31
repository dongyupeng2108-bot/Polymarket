
import { prisma } from '../../db';
import { Snapshot, OpportunityDirection } from '@prisma/client';
import { MarketOrderBook, FetchDebugResult } from '../../types';
import { calculateSlippage } from '../../utils/orderbook-math';

interface VWAPResult {
    vwap: number;
    depthOk: boolean;
    reason_code: string; 
}

// Wrapper using orderbook-math
function calculateVWAP(side: 'buy' | 'sell', book: MarketOrderBook, qty: number): VWAPResult {
    const levels = side === 'buy' ? book.asks : book.bids;
    if (!levels || levels.length === 0) {
        return { vwap: 0, depthOk: false, reason_code: 'no_orderbook' };
    }

    // calculateSlippage handles the math
    const result = calculateSlippage(side, qty, book);
    
    // Check if we filled the requested quantity
    if (result.filledSize < qty) {
        return { vwap: 0, depthOk: false, reason_code: 'depth_insufficient' };
    }

    return { vwap: result.vwap, depthOk: true, reason_code: 'ok' };
}

// Compatibility wrappers
function calculateBuyVWAP(book: MarketOrderBook, qty: number): VWAPResult {
    return calculateVWAP('buy', book, qty);
}

function calculateSellVWAP(book: MarketOrderBook, qty: number): VWAPResult {
    return calculateVWAP('sell', book, qty);
}

export async function evaluateOpportunity(snapshot: any, debugStats?: { pm: FetchDebugResult, kh: FetchDebugResult }, overrides?: { minEdge?: number }) {
  const pmBook = snapshot.pm_book as MarketOrderBook;
  const khBook = snapshot.kh_book as MarketOrderBook;
  
  // Load pair (Support injection for testing)
  const pair = snapshot.pair || await prisma.pair.findUnique({ where: { id: snapshot.pair_id } });
  if (!pair) return;

  const isNotBinary = !pair.is_binary;

  // Settings
  const settings = snapshot.settings || await prisma.settings.findFirst();
  const qty = settings?.qty_default || 100;
  const feePm = settings?.fee_pm || 0;
  const feeKh = settings?.fee_kh || 0;
  const slippageBuffer = 0.01;
  
  // New Runtime Config Logic
  // Check if OPP_MODE is set to determine behavior
  let minEdge = settings?.min_edge_pct || 0.01;
  
  // Override priority: 
  // 1. Explicit override (e.g. from API/CLI)
  // 2. Runtime ENV override (OPP_EDGE_THRESHOLD)
  // 3. Database setting
  if (overrides && overrides.minEdge !== undefined) {
      minEdge = overrides.minEdge;
  } else if (process.env.OPP_MODE === 'dev') {
      if (process.env.OPP_EDGE_THRESHOLD_DEV) {
          minEdge = parseFloat(process.env.OPP_EDGE_THRESHOLD_DEV);
      } else if (process.env.OPP_EDGE_THRESHOLD) {
          minEdge = parseFloat(process.env.OPP_EDGE_THRESHOLD);
      }
  } else if (process.env.OPP_MODE === 'prod') {
      if (process.env.OPP_EDGE_THRESHOLD) {
          minEdge = parseFloat(process.env.OPP_EDGE_THRESHOLD);
      }
  } else {
      // Legacy behavior (OPP_MODE unset)
      if (process.env.OPP_EDGE_THRESHOLD) {
          minEdge = parseFloat(process.env.OPP_EDGE_THRESHOLD);
      }
  }


  // 1. Calc Prices
  const pmBuy = calculateBuyVWAP(pmBook, qty);   
  const pmSell = calculateSellVWAP(pmBook, qty); 
  const khBuy = calculateBuyVWAP(khBook, qty);   
  const khSell = calculateSellVWAP(khBook, qty); 

  // 2. Evaluate Directions
  let bestDir: OpportunityDirection | null = null;
  let maxEdge = -999;
  let entryPrice = 0;
  let exitPrice = 0;
  
  // Dir A: Buy PM, Sell KH
  if (pmBuy.depthOk && khSell.depthOk) {
      const edgeA = (khSell.vwap - pmBuy.vwap) - slippageBuffer; 
      const netEdgeA = edgeA - (pmBuy.vwap * feePm) - (khSell.vwap * feeKh);
      
      if (netEdgeA > maxEdge) {
          maxEdge = netEdgeA;
          bestDir = 'PM_YES_KH_NO'; 
          entryPrice = pmBuy.vwap;
          exitPrice = khSell.vwap;
      }
  }

  // Dir B: Buy KH, Sell PM
  if (khBuy.depthOk && pmSell.depthOk) {
      const edgeB = (pmSell.vwap - khBuy.vwap) - slippageBuffer;
      const netEdgeB = edgeB - (khBuy.vwap * feeKh) - (pmSell.vwap * feePm);

      if (netEdgeB > maxEdge) {
          maxEdge = netEdgeB;
          bestDir = 'PM_NO_KH_YES'; 
          entryPrice = khBuy.vwap;
          exitPrice = pmSell.vwap;
      }
  }

  // Result Logic
  // NaN Fix: Check if maxEdge is finite
  const isEdgeValid = Number.isFinite(maxEdge);
  const isOpportunity = !isNotBinary && bestDir !== null && isEdgeValid && maxEdge > minEdge;
  let reason = 'No edge';
  let reasonCode = 'ok';
  
  if (isNotBinary) {
      reason = 'Skipped: Not Binary / Multi-Outcome';
      reasonCode = 'not_binary';
  } else if (!pair.pm_yes_token_id) {
      reason = 'Contract not found (ID pending)';
      reasonCode = 'contract_not_found';
  } else if (bestDir) {
      if (!isEdgeValid) {
          reason = `Edge Invalid (NaN/Infinity)`;
          reasonCode = 'invalid_edge';
      } else if (maxEdge <= minEdge) {
          reason = `Edge ${maxEdge.toFixed(4)} < Min ${minEdge}`;
          reasonCode = 'edge_low';
      } else {
          reason = 'Opportunity Found';
          reasonCode = 'ok';
      }
  } else {
      // Failure Analysis
      const pmBuyFail = pmBuy.reason_code;
      const pmSellFail = pmSell.reason_code;
      const khBuyFail = khBuy.reason_code;
      const khSellFail = khSell.reason_code;

      if (pmBuyFail !== 'ok' && pmSellFail !== 'ok') {
          if (pmBuyFail === 'no_orderbook' && pmSellFail === 'no_orderbook') {
              reason = 'no_orderbook (PM)';
              reasonCode = 'no_orderbook_pm';
          } else {
              reason = `depth_insufficient (PM)`;
              reasonCode = 'depth_insufficient_pm';
          }
      } 
      else if (khBuyFail !== 'ok' && khSellFail !== 'ok') {
           if (khBuyFail === 'no_orderbook' && khSellFail === 'no_orderbook') {
               reason = 'no_orderbook (KH)';
               reasonCode = 'no_orderbook_kh';
           } else {
               reason = `depth_insufficient (KH)`;
               reasonCode = 'depth_insufficient_kh';
           }
      }
      else {
          reason = 'depth_insufficient (Mixed)';
          reasonCode = 'depth_insufficient_mixed';
      }
  }

  // Enhanced Failure Analysis using Debug Stats
  if (debugStats) {
      // Check for KH Errors
      if (reasonCode === 'no_orderbook_kh' || debugStats.kh.http_status !== 200) {
           if (debugStats.kh.http_status && debugStats.kh.http_status !== 200 && debugStats.kh.http_status !== 0) {
               reason = `KH HTTP ${debugStats.kh.http_status}`;
               reasonCode = `kh_http_${debugStats.kh.http_status}`;
           } else if (debugStats.kh.error_code) {
               reason = `KH Error: ${debugStats.kh.error_code}`;
               reasonCode = debugStats.kh.error_code;
           } else if (debugStats.kh.http_status === 0) {
               reason = `KH Network Error`;
               reasonCode = `kh_network_error`;
           }
      }

      // Check for PM Errors
      if (reasonCode === 'no_orderbook_pm' || debugStats.pm.http_status !== 200) {
           if (debugStats.pm.http_status && debugStats.pm.http_status !== 200 && debugStats.pm.http_status !== 0) {
               reason = `PM HTTP ${debugStats.pm.http_status}`;
               reasonCode = `pm_http_${debugStats.pm.http_status}`;
           } else if (debugStats.pm.error_code) {
               reason = `PM Error: ${debugStats.pm.error_code}`;
               reasonCode = debugStats.pm.error_code;
           } else if (debugStats.pm.http_status === 0) {
               reason = `PM Network Error`;
               reasonCode = `pm_network_error`;
           }
      }
  }

  // Downgrade Logic
  if (reasonCode === 'contract_not_found') {
      await prisma.pair.update({
          where: { id: pair.id },
          data: { status: 'needs_review', notes: 'Downgraded by Evaluator: contract_not_found' }
      });
  }
  
  // Auto Downgrade on Fetch Failures
  if (pair.status === 'verified' && (
      reasonCode.startsWith('kh_http') || 
      reasonCode.startsWith('pm_http') || 
      reasonCode.includes('no_orderbook') || 
      reasonCode.includes('empty_depth') ||
      reasonCode.includes('parse_error')
  )) {
      await prisma.pair.update({
          where: { id: pair.id },
          data: { status: 'ready', notes: `Downgraded by Evaluator: ${reason}` }
      });
      console.log(`[Evaluator] Downgraded Pair #${pair.id} to READY due to ${reasonCode}`);
  }

  // Debug Info
  const debugInfo = {
      pm: {
          market_id: pair.pm_yes_token_id,
          slug: pair.pm_market_slug,
          best_bid: snapshot.pm_best_yes_bid,
          best_ask: snapshot.pm_best_yes_ask,
          outcome: 'YES',
          fetch: debugStats?.pm
      },
      kh: {
          ticker: pair.kh_ticker,
          best_bid: snapshot.kh_best_yes_bid,
          best_ask: snapshot.kh_best_yes_ask,
          fetch: debugStats?.kh
      }
  };

  // Write Evaluation
  await prisma.evaluation.create({
      data: {
          pair_id: snapshot.pair_id,
          snapshot_id: snapshot.id,
          pm_price_bid: pmSell.depthOk ? pmSell.vwap : null,
          pm_price_ask: pmBuy.depthOk ? pmBuy.vwap : null,
          kh_price_bid: khSell.depthOk ? khSell.vwap : null,
          kh_price_ask: khBuy.depthOk ? khBuy.vwap : null,
          edge_raw: maxEdge > -999 ? maxEdge : null,
          is_opportunity: isOpportunity,
          reason: reason,
          reason_code: reasonCode,
          debug_info: debugInfo as any
      }
  });

  // Save Opportunity if good
  if (isOpportunity && bestDir) {
      await prisma.opportunity.create({
          data: {
              pair_id: snapshot.pair_id,
              direction: bestDir,
              qty: qty,
              pm_vwap: bestDir === 'PM_YES_KH_NO' ? entryPrice : exitPrice, 
              kh_vwap: bestDir === 'PM_YES_KH_NO' ? exitPrice : entryPrice, 
              fee_total: (entryPrice + exitPrice) * 0.01, 
              misc_total: 0,
              exec_cost_total: entryPrice * qty,
              profit_per_share: maxEdge,
              profit_total: maxEdge * qty,
              edge_pct: maxEdge,
              depth_ok: true,
              reason: reason,
              debug_info: debugInfo as any
          }
      });
      console.log(`  -> Opportunity Saved (Edge: ${(maxEdge*100).toFixed(2)}%)`);
  } else {
      console.log(`  -> Eval: ${reason} [${reasonCode}]`);
  }
}
