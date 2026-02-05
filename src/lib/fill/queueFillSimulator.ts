
export interface FillStatus {
  filledSize: number;
  remainingSize: number;
  isFilled: boolean;
  effectiveProgress: number;
  cumTradeAtP: number;
  cumObRemovedAtP: number;
  fillConfidence: number; // trade / effective_progress
}

export class QueueFillSimulator {
  private queueAhead0: number;
  private size: number;
  private filledSize: number = 0;
  private cumTradeAtP: number = 0;
  private cumObRemovedAtP: number = 0; // Only tracks reduction (cancels + trades)
  
  // Params
  private limitPrice: number;
  private side: string; // 'BUY' | 'SELL' (PM) or 'YES' | 'NO' (KH)
  private createdTs: number;

  constructor(
    size: number,
    limitPrice: number,
    side: string,
    queueAhead0: number,
    createdTs: number = Date.now()
  ) {
    this.size = size;
    this.limitPrice = limitPrice;
    this.side = side;
    this.queueAhead0 = queueAhead0;
    this.createdTs = createdTs;
  }

  /**
   * Update state with a new trade
   * @param tradeSize Size of the trade
   * @param price Price of the trade
   * @param makerSide Side of the MAKER (passive order) that was matched against. 
   *                  Wait, usually we get Taker Side or just Side.
   *                  Let's follow user rules:
   *                  PM: 
   *                    My Order BUY -> Trade Side SELL (Taker is Sell)
   *                    My Order SELL -> Trade Side BUY (Taker is Buy)
   *                  KH:
   *                    My Order YES (Bid) -> Trade Taker Side NO
   *                    My Order NO (Bid) -> Trade Taker Side YES
   * @param tradeSide The raw side from the feed
   * @param ts Timestamp of trade
   */
  onTrade(tradeSize: number, price: number, tradeSide: string, ts: number) {
    if (ts < this.createdTs) return;
    if (price !== this.limitPrice) return;

    let match = false;
    // Polymarket logic: BUY/SELL
    if (this.side === 'BUY' && tradeSide === 'SELL') match = true;
    else if (this.side === 'SELL' && tradeSide === 'BUY') match = true;
    
    // Kalshi logic: YES/NO
    // User: "你挂 YES bid ... 会被 taker_side=='no' 的 trade 吃到"
    // User: "你挂 NO bid ... 会被 taker_side=='yes' 的 trade 吃到"
    else if (this.side === 'YES' && tradeSide === 'no') match = true; // Kalshi often uses lowercase
    else if (this.side === 'NO' && tradeSide === 'yes') match = true;
    else if (this.side === 'YES' && tradeSide === 'NO') match = true;
    else if (this.side === 'NO' && tradeSide === 'YES') match = true;

    if (match) {
      this.cumTradeAtP += tradeSize;
    }
  }

  /**
   * Update state with orderbook delta (only reductions count)
   * @param delta Size change (negative means reduction)
   * @param price Price level
   * @param side Side of the level
   */
  onObDelta(delta: number, price: number, side: string) {
    if (price !== this.limitPrice) return;
    
    // Side check
    // PM: BUY/SELL. KH: YES/NO (mapped from bids/asks in adapter?)
    // Usually OB updates come as Bids/Asks.
    // If I am BUY (Bid), I care about Bid side updates.
    // If I am SELL (Ask), I care about Ask side updates.
    
    // Normalize side to match this.side
    // If simulator uses BUY/SELL/YES/NO, caller must pass matching side.
    if (side !== this.side) return;

    if (delta < 0) {
      // Delta is negative (reduction). We track the magnitude of reduction.
      // cumObRemovedAtP += -delta
      this.cumObRemovedAtP += (-delta);
    }
  }

  getFillStatus(cancelWeight: number, queueBuffer: number): FillStatus {
    // effective_progress = cum_trade_at_p + cancel_weight * max(0, cum_ob_removed_at_p - cum_trade_at_p)
    // Explanation: OB removed includes trades. We subtract trades to get "cancels".
    // We assume all trades visible in trade feed also reduced OB. 
    // Sometimes timing differs, but max(0, ...) handles if trade feed lags OB feed.
    
    const assumedCancels = Math.max(0, this.cumObRemovedAtP - this.cumTradeAtP);
    const effectiveProgress = this.cumTradeAtP + cancelWeight * assumedCancels;
    
    const adjustedQueueAhead = this.queueAhead0 * (1 + queueBuffer);
    
    // Filled amount = clamp(effective_progress - adjustedQueueAhead, 0, size)
    const rawFilled = Math.max(0, effectiveProgress - adjustedQueueAhead);
    const filledSize = Math.min(rawFilled, this.size);
    
    const isFilled = filledSize >= this.size; // Or close enough? Floating point.
    // Let's stick to >= size for full fill.

    return {
      filledSize,
      remainingSize: this.size - filledSize,
      isFilled,
      effectiveProgress,
      cumTradeAtP: this.cumTradeAtP,
      cumObRemovedAtP: this.cumObRemovedAtP,
      fillConfidence: effectiveProgress > 0 ? (this.cumTradeAtP / effectiveProgress) : 0
    };
  }
}
