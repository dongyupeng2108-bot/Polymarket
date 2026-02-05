
export interface OrderBookLevel {
    price: number; // 0.00 - 1.00
    size: number;
}

export interface OrderBook {
    bids: OrderBookLevel[]; // Sorted DESC
    asks: OrderBookLevel[]; // Sorted ASC
}

export interface SlippageResult {
    vwap: number;
    filledSize: number;
    remainingSize: number;
    cost: number;
    levelsConsumed: number;
    worstPrice: number;
}

export interface EdgeResult {
    direction: 'buy' | 'sell' | 'none';
    grossEdge: number;
    netEdge: number;
    maxSize: number; // Max size executable at this edge (limited by OB depth for target size)
    vwap: number;
}

/**
 * Calculate execution metrics for a given size against the orderbook
 * @param side 'buy' (executes against asks) or 'sell' (executes against bids)
 * @param targetSize Number of contracts to execute
 * @param book The YES-perspective orderbook
 */
export function calculateSlippage(
    side: 'buy' | 'sell', 
    targetSize: number, 
    book: OrderBook
): SlippageResult {
    const levels = side === 'buy' ? book.asks : book.bids;
    
    let remaining = targetSize;
    let totalCost = 0;
    let levelsConsumed = 0;
    let worstPrice = 0;

    // Safety check for empty book
    if (!levels || levels.length === 0) {
        return {
            vwap: 0,
            filledSize: 0,
            remainingSize: targetSize,
            cost: 0,
            levelsConsumed: 0,
            worstPrice: 0
        };
    }

    for (const level of levels) {
        if (remaining <= 0) break;

        const executeSize = Math.min(remaining, level.size);
        totalCost += executeSize * level.price;
        remaining -= executeSize;
        levelsConsumed++;
        worstPrice = level.price;
    }

    const filled = targetSize - remaining;
    const vwap = filled > 0 ? totalCost / filled : 0;

    return {
        vwap,
        filledSize: filled,
        remainingSize: remaining,
        cost: totalCost,
        levelsConsumed,
        worstPrice
    };
}

/**
 * Evaluate arbitrage edge against a competitor price
 * @param competitorPrice The price on the other exchange (0.00-1.00)
 * @param targetSize Target execution size
 * @param fee Fee per contract (in $)
 * @param book Kalshi orderbook
 */
export function evaluateKalshiEdge(
    competitorPrice: number,
    targetSize: number,
    fee: number = 0,
    book: OrderBook
): EdgeResult {
    // Scenario 1: Buy Kalshi (hit Asks), Sell Competitor
    // We want Competitor Price > Kalshi Buy VWAP
    const buyResult = calculateSlippage('buy', targetSize, book);
    const buyVWAP = buyResult.vwap;
    
    // Scenario 2: Sell Kalshi (hit Bids), Buy Competitor
    // We want Kalshi Sell VWAP > Competitor Price
    const sellResult = calculateSlippage('sell', targetSize, book);
    const sellVWAP = sellResult.vwap;

    // Check Buy Edge (Buy Kalshi, Sell Competitor)
    // Edge = Sell_Price (Competitor) - Buy_Cost (Kalshi)
    const buyGrossEdge = (buyResult.filledSize > 0) ? (competitorPrice - buyVWAP) : -1;
    
    // Check Sell Edge (Sell Kalshi, Buy Competitor)
    // Edge = Sell_Proceeds (Kalshi) - Buy_Cost (Competitor)
    const sellGrossEdge = (sellResult.filledSize > 0) ? (sellVWAP - competitorPrice) : -1;

    if (buyGrossEdge > sellGrossEdge && buyGrossEdge > 0) {
        return {
            direction: 'buy',
            grossEdge: buyGrossEdge,
            netEdge: buyGrossEdge - fee,
            maxSize: buyResult.filledSize,
            vwap: buyVWAP
        };
    } else if (sellGrossEdge > buyGrossEdge && sellGrossEdge > 0) {
        return {
            direction: 'sell',
            grossEdge: sellGrossEdge,
            netEdge: sellGrossEdge - fee,
            maxSize: sellResult.filledSize,
            vwap: sellVWAP
        };
    }

    return {
        direction: 'none',
        grossEdge: 0,
        netEdge: 0,
        maxSize: 0,
        vwap: 0
    };
}
