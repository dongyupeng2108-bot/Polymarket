
import { ScanResult } from '@/lib/services/scanner';

export type ExecutionMode = 'MakerTaker' | 'MakerMaker' | 'TakerTaker';

export interface PlatformConfig {
    id: string; // 'pm' | 'kh'
    makerFeeRate: number; // % (e.g. 0 or -0.1)
    takerFeeRate: number; // % (e.g. 0.1 or 0.2)
    makerIncentivePerShare: number; // $ per share (e.g. 0.005)
    slippageModel: {
        enabled: boolean;
        fixedBps?: number;
        useDepth: boolean;
    };
}

export interface PaperTradeConfig {
    virtualFund: number; // Total available capital
    platforms: Record<string, PlatformConfig>; // 'pm' -> config, 'kh' -> config
}

export interface LegResult {
    platform: string;
    side: 'BUY' | 'SELL'; // In UI this will often be shown as BUY YES / BUY NO
    outcome: 'YES' | 'NO'; // New field
    role: 'MAKER' | 'TAKER';
    price: number; // For YES: Buy Price. For NO: Buy Cost (1 - SellPrice).
    rawPrice: number; // The actual venue price (e.g. Sell YES price)
    size: number;
    notional: number; // price * size
    fee: number;
    incentive: number;
    slippage: number; // Total Slippage Cost ($)
    slippagePerShare: number; // Slippage per share ($)
    vwap: number; // For NO: 1 - ActualVWAP
    depthStatus: 'DEPTH_OK' | 'DEPTH_INSUFFICIENT';
    depthAvailable?: number; // How much size was available in depth
    requiredCapital: number; // Capital required for this leg
}

export interface PaperTradeResult {
    mode: ExecutionMode;
    tradeable: boolean;
    gross_edge: number;
    fees_cost: number;
    slippage_cost: number;
    incentives: number;
    net_profit: number; // Net PnL (Profit - Fees - Slippage + Incentives)
    net_ev: number; // Same as net_profit for now
    roi: number; // net_profit / cost
    legs: [LegResult, LegResult];
    depthStatus: 'DEPTH_OK' | 'DEPTH_INSUFFICIENT'; // Overall status
    error?: string;
    
    // Explainability Fields
    shares_used: number;
    buy_notional: number; // Capital used for Buy Leg
    sell_notional: number; // Notional of Sell Leg (Price * Size)
    total_required_capital: number; // Total Capital Locked
    gross_per_share: number;
    net_per_share: number;
    total_cost_per_share: number; // New: YES + NO cost
    sanity_status: 'OK' | 'BUG_SUSPECT';
}

// Helper to calc VWAP
// Returns VWAP of what is available. If not enough depth, calculate VWAP of available and mark insufficient.
function calculateVwap(depth: { price: number; size: number }[], targetSize: number): { vwap: number; filled: number; status: 'DEPTH_OK' | 'DEPTH_INSUFFICIENT' } {
    if (!depth || depth.length === 0) return { vwap: 0, filled: 0, status: 'DEPTH_INSUFFICIENT' };

    let remaining = targetSize;
    let totalCost = 0;
    let filled = 0;

    for (const level of depth) {
        const take = Math.min(remaining, level.size);
        totalCost += take * level.price;
        filled += take;
        remaining -= take;
        if (remaining <= 0.000001) break;
    }

    if (filled === 0) return { vwap: 0, filled: 0, status: 'DEPTH_INSUFFICIENT' };

    const vwap = totalCost / filled;
    
    // If not fully filled, we mark as INSUFFICIENT.
    // The caller should decide how to handle the "remaining" part cost.
    // For this model, we assume the REST is filled at the LAST price (or just ignore for unit economics, but for total cost it matters).
    // Let's assume we can only fill 'filled' amount? No, user wants cost model.
    // If depth insufficient, we use the VWAP of what IS available as the proxy for the whole order, 
    // but flag it as unreliable.
    
    return {
        vwap,
        filled,
        status: remaining > 0.0001 ? 'DEPTH_INSUFFICIENT' : 'DEPTH_OK'
    };
}

// Helper to calculate single leg execution
function calculateLeg(
    platformId: string,
    side: 'BUY' | 'SELL',
    role: 'MAKER' | 'TAKER',
    bestBid: number,
    bestAsk: number,
    bids: { price: number; size: number }[],
    asks: { price: number; size: number }[],
    size: number,
    config: PlatformConfig
): LegResult {
    let price = 0;
    let slippageTotal = 0;
    let slippagePerShare = 0;
    let depthStatus: 'DEPTH_OK' | 'DEPTH_INSUFFICIENT' = 'DEPTH_OK';
    let vwap = 0;
    let depthAvailable = size;

    if (role === 'MAKER') {
        // Maker:
        // Buy at Best Bid (or slightly better? standard is join Best Bid)
        // Sell at Best Ask
        price = side === 'BUY' ? bestBid : bestAsk;
        slippageTotal = 0;
        slippagePerShare = 0;
        depthStatus = 'DEPTH_OK'; // Maker doesn't consume depth
    } else {
        // Taker:
        // Buy at Best Ask (consume Asks)
        // Sell at Best Bid (consume Bids)
        const depth = side === 'BUY' ? asks : bids;
        const referencePrice = side === 'BUY' ? bestAsk : bestBid; // Reference for slippage calc
        
        if (config.slippageModel.useDepth) {
            const vwapRes = calculateVwap(depth, size);
            vwap = vwapRes.vwap || referencePrice;
            price = vwap;
            depthStatus = vwapRes.status;
            depthAvailable = vwapRes.filled;
            
            // Slippage Calculation:
            // Buy: Actual Price (VWAP) - Best Ask. (VWAP > BestAsk -> Positive Cost)
            // Sell: Best Bid - Actual Price (VWAP). (VWAP < BestBid -> Positive Cost)
            if (side === 'BUY') {
                slippagePerShare = Math.max(0, price - referencePrice);
            } else {
                slippagePerShare = Math.max(0, referencePrice - price);
            }
            slippageTotal = slippagePerShare * size;
            
        } else {
            // Fixed Model
            price = referencePrice;
            if (config.slippageModel.fixedBps) {
                const slip = price * (config.slippageModel.fixedBps / 10000);
                if (side === 'BUY') {
                    price += slip;
                } else {
                    price -= slip;
                }
                slippagePerShare = slip;
                slippageTotal = slip * size;
            }
        }
    }

    const notional = price * size;
    // Fees
    const feeRate = role === 'MAKER' ? config.makerFeeRate : config.takerFeeRate;
    const fee = notional * (feeRate / 100);

    // Incentives (Maker only, per share)
    const incentive = role === 'MAKER' ? (size * config.makerIncentivePerShare) : 0;

    // Required Capital: For basic leg calculation, just use notional.
    // The aggregator will adjust for "Buy NO" scenarios.
    const requiredCapital = notional;

    return {
        platform: platformId,
        side,
        outcome: 'YES', // Default, will be overridden for NO legs
        role,
        price,
        rawPrice: price,
        size,
        notional,
        fee,
        incentive,
        slippage: slippageTotal,
        slippagePerShare,
        vwap,
        depthStatus,
        depthAvailable,
        requiredCapital
    };
}

export function calculatePaperTrade(
    opportunity: ScanResult,
    config: PaperTradeConfig,
    mode: ExecutionMode
): PaperTradeResult {
    // 1. Validate Opportunity
    if (!opportunity.prices || !opportunity.market_data) {
        return createErrorResult(mode, 'Invalid Opportunity Data');
    }

    const pmConfig = config.platforms['pm'];
    const khConfig = config.platforms['kh'];
    if (!pmConfig || !khConfig) return createErrorResult(mode, 'Missing Platform Config');

    // Prices & Depth
    const pmBid = opportunity.prices.pm_bid || 0;
    const pmAsk = opportunity.prices.pm_ask || 0;
    const khBid = opportunity.prices.kh_bid || 0;
    const khAsk = opportunity.prices.kh_ask || 0;

    const pmBids = opportunity.market_data.pm.bids || [];
    const pmAsks = opportunity.market_data.pm.asks || [];
    const khBids = opportunity.market_data.kh.bids || [];
    const khAsks = opportunity.market_data.kh.asks || [];

    // Helper to get platform data
    const getPlatformData = (pid: string) => {
        if (pid === 'pm') return { config: pmConfig, bid: pmBid, ask: pmAsk, bids: pmBids, asks: pmAsks };
        return { config: khConfig, bid: khBid, ask: khAsk, bids: khBids, asks: khAsks };
    };

    // Calculate Combo: BUY YES (A) + BUY NO (B)
    const calculateCombo = (
        yesPlatformId: string, 
        noPlatformId: string, 
        roleYes: 'MAKER'|'TAKER', 
        roleNo: 'MAKER'|'TAKER'
    ): PaperTradeResult => {
        const pYes = getPlatformData(yesPlatformId);
        const pNo = getPlatformData(noPlatformId);

        // 1. Determine Unit Cost to Size Position
        // Estimate Prices for Sizing (using Top of Book)
        
        // YES Leg: Buy YES
        const estPriceYes = roleYes === 'MAKER' ? pYes.bid : pYes.ask;
        // NO Leg: Sell YES (to Buy NO) -> Cost = 1 - SellPrice
        const estSellPriceNo = roleNo === 'MAKER' ? pNo.ask : pNo.bid;
        const estCostNo = 1 - estSellPriceNo;

        if (estPriceYes <= 0 || estSellPriceNo <= 0) return createErrorResult(mode, 'Invalid Prices');
        
        const totalUnitCost = estPriceYes + estCostNo;
        // Sizing
        const maxShares = Math.floor(config.virtualFund / totalUnitCost);
        const size = maxShares;

        // 2. Execute Legs
        
        // Leg A: Buy YES
        const legYes = calculateLeg(
            yesPlatformId, 
            'BUY', 
            roleYes, 
            pYes.bid, pYes.ask, pYes.bids, pYes.asks, 
            size, 
            pYes.config
        );
        legYes.outcome = 'YES';

        // Leg B: Buy NO (implemented as Sell YES)
        const legNoRaw = calculateLeg(
            noPlatformId, 
            'SELL', 
            roleNo, 
            pNo.bid, pNo.ask, pNo.bids, pNo.asks, 
            size, 
            pNo.config
        );
        
        // Transform Leg B to "Buy NO" perspective
        const legNo: LegResult = {
            ...legNoRaw,
            side: 'BUY', // UI: BUY NO
            outcome: 'NO',
            price: 1 - legNoRaw.price, // Cost to Buy NO
            rawPrice: legNoRaw.price, // Sell Price
            vwap: 1 - legNoRaw.vwap, // Cost VWAP
            requiredCapital: (1 - legNoRaw.price) * size, // Capital used for NO leg
            // Fees, Slippage, Incentives stay as calculated on the raw Sell execution
        };

        // 3. Aggregate
        const totalCostPerShare = legYes.price + legNo.price;
        const totalRequiredCapital = legYes.notional + legNo.requiredCapital;
        
        // Gross Profit = Shares * (1 - Total Cost)
        // Or: Payoff ($1 * Size) - Cost (Total Capital)
        // Gross Profit = Size - TotalRequiredCapital
        const grossProfit = size - totalRequiredCapital;

        const totalFees = legYes.fee + legNo.fee;
        const totalIncentives = legYes.incentive + legNo.incentive;
        const totalSlippage = legYes.slippage + legNo.slippage;

        const netProfit = grossProfit - totalFees + totalIncentives;

        const overallDepthStatus = (legYes.depthStatus === 'DEPTH_OK' && legNo.depthStatus === 'DEPTH_OK') ? 'DEPTH_OK' : 'DEPTH_INSUFFICIENT';

        // Sanity Checks
        let sanityStatus: 'OK' | 'BUG_SUSPECT' = 'OK';
        const netPerShare = size > 0 ? (netProfit / size) : 0;
        
        // Rule 16: Cost > 1.0001 & Incentives=0 -> Net <= 0
        if (totalCostPerShare > 1.0001 && totalIncentives === 0 && netPerShare > 0) {
            sanityStatus = 'BUG_SUSPECT';
        }
        // Rule 17: Net Per Share > 1
        if (netPerShare > 1.0) {
            sanityStatus = 'BUG_SUSPECT';
        }
        // Extra: Net Per Share < -1.1 (allow some slippage/fees)
        if (netPerShare < -1.1) {
            // Not necessarily a bug, but suspicious? 
            // User only asked for > 1 or Cost > 1 check.
        }

        return {
            mode,
            tradeable: overallDepthStatus === 'DEPTH_OK' && netProfit > 0 && sanityStatus === 'OK',
            gross_edge: grossProfit,
            fees_cost: totalFees,
            slippage_cost: totalSlippage,
            incentives: totalIncentives,
            net_profit: netProfit,
            net_ev: netProfit,
            roi: totalRequiredCapital > 0 ? (netProfit / totalRequiredCapital) * 100 : 0,
            legs: [legYes, legNo],
            depthStatus: overallDepthStatus,
            
            shares_used: size,
            buy_notional: legYes.notional,
            sell_notional: legNo.notional, // Note: this is legally the "Buy NO Notional" (Cost)
            total_required_capital: totalRequiredCapital,
            gross_per_share: size > 0 ? (grossProfit / size) : 0,
            net_per_share: netPerShare,
            total_cost_per_share: totalCostPerShare,
            sanity_status: sanityStatus
        };
    };

    // Try both combos
    // Combo 1: YES(PM) + NO(KH)
    // Combo 2: NO(PM) + YES(KH)
    
    let res1: PaperTradeResult;
    let res2: PaperTradeResult;

    if (mode === 'MakerTaker') {
        // We need to decide who is Maker. 
        // Logic: P0 Auto-select best Maker leg.
        // For Combo 1: Try (Maker, Taker) and (Taker, Maker)
        // For Combo 2: Try (Maker, Taker) and (Taker, Maker)
        // Return Best of 4? Or just stick to the requested logic.
        // User said: "P0模式自动选择最优maker腿".
        
        const c1_mt = calculateCombo('pm', 'kh', 'MAKER', 'TAKER');
        const c1_tm = calculateCombo('pm', 'kh', 'TAKER', 'MAKER');
        const bestC1 = c1_mt.net_ev >= c1_tm.net_ev ? c1_mt : c1_tm;

        const c2_mt = calculateCombo('kh', 'pm', 'MAKER', 'TAKER');
        const c2_tm = calculateCombo('kh', 'pm', 'TAKER', 'MAKER');
        const bestC2 = c2_mt.net_ev >= c2_tm.net_ev ? c2_mt : c2_tm;

        return bestC1.net_ev >= bestC2.net_ev ? bestC1 : bestC2;

    } else if (mode === 'MakerMaker') {
        res1 = calculateCombo('pm', 'kh', 'MAKER', 'MAKER');
        res2 = calculateCombo('kh', 'pm', 'MAKER', 'MAKER');
        return res1.net_ev >= res2.net_ev ? res1 : res2;
    } else {
        // TakerTaker
        res1 = calculateCombo('pm', 'kh', 'TAKER', 'TAKER');
        res2 = calculateCombo('kh', 'pm', 'TAKER', 'TAKER');
        return res1.net_ev >= res2.net_ev ? res1 : res2;
    }
}

function createErrorResult(mode: ExecutionMode, error: string): PaperTradeResult {
    return {
        mode,
        tradeable: false,
        gross_edge: 0,
        fees_cost: 0,
        slippage_cost: 0,
        incentives: 0,
        net_profit: 0,
        net_ev: 0,
        roi: 0,
        legs: [] as any,
        depthStatus: 'DEPTH_INSUFFICIENT',
        error,
        shares_used: 0,
        buy_notional: 0,
        sell_notional: 0,
        total_required_capital: 0,
        gross_per_share: 0,
        net_per_share: 0,
        total_cost_per_share: 0,
        sanity_status: 'OK'
    };
}
