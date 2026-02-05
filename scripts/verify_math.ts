
import { calculateSlippage, evaluateKalshiEdge, OrderBook } from '../src/lib/utils/orderbook-math';

function main() {
    // Mock Orderbook based on KW data
    // Bids: 0.61 (2000), 0.60 (4000)
    // Asks: 0.62 (20000), 0.63 (3000)
    const mockBook: OrderBook = {
        bids: [
            { price: 0.61, size: 2000 },
            { price: 0.60, size: 4000 }
        ],
        asks: [
            { price: 0.62, size: 20000 },
            { price: 0.63, size: 3000 }
        ]
    };

    console.log('--- Orderbook Math Verification ---');

    // 1. Test Slippage (Buy 1000)
    const buy1000 = calculateSlippage('buy', 1000, mockBook);
    console.log(`Buy 1000: VWAP=${buy1000.vwap.toFixed(4)}, Filled=${buy1000.filledSize}, Cost=${buy1000.cost}`);
    // Expected: 0.62 * 1000 = 620. VWAP 0.62.

    // 2. Test Slippage (Buy 21000) - Should eat into 0.63
    const buy21000 = calculateSlippage('buy', 21000, mockBook);
    console.log(`Buy 21000: VWAP=${buy21000.vwap.toFixed(4)}, Filled=${buy21000.filledSize}, Cost=${buy21000.cost}`);
    // Expected: (20000 * 0.62 + 1000 * 0.63) / 21000 
    // = (12400 + 630) / 21000 = 13030 / 21000 = 0.62047...

    // 3. Test Edge (Competitor Price = 0.65)
    // We can Buy Kalshi at ~0.62. Sell Competitor at 0.65.
    // Edge = 0.65 - 0.62 = 0.03.
    const edgeBuy = evaluateKalshiEdge(0.65, 1000, 0, mockBook);
    console.log(`Edge vs 0.65 (Target 1000): Dir=${edgeBuy.direction}, Gross=${edgeBuy.grossEdge.toFixed(4)}`);

    // 4. Test Edge (Competitor Price = 0.58)
    // We can Sell Kalshi at ~0.61. Buy Competitor at 0.58.
    // Edge = 0.61 - 0.58 = 0.03.
    const edgeSell = evaluateKalshiEdge(0.58, 1000, 0, mockBook);
    console.log(`Edge vs 0.58 (Target 1000): Dir=${edgeSell.direction}, Gross=${edgeSell.grossEdge.toFixed(4)}`);

    // 5. Test Edge (Competitor Price = 0.615) - Inside spread
    // Buy Kalshi @ 0.62 (Loss), Sell Kalshi @ 0.61 (Loss).
    const edgeNone = evaluateKalshiEdge(0.615, 1000, 0, mockBook);
    console.log(`Edge vs 0.615 (Target 1000): Dir=${edgeNone.direction}`);
}

main();
