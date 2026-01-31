
import { MarketOrderBook } from '../types';

export interface SimulationResult {
    tradeable: boolean;
    direction: "BUY_PM_SELL_KH" | "BUY_KH_SELL_PM" | "NONE";
    gross_edge: number | null;
    net_edge: number | null;
    expected_profit: number | null;
    max_size_at_top: number | null; // Placeholder for now
    quality_score: number; // M2 Quality Score (0-100)
    quality_tags: string[]; // M2 Quality Tags
    components: {
        fee_cost: number;
        slippage_cost: number;
        latency_penalty: number;
        depth_ok: boolean;
        price_ok: boolean;
        reason?: string;
    };
}

export interface SimulationInput {
    pm_bid: number | null;
    pm_ask: number | null;
    kh_bid: number | null;
    kh_ask: number | null;
    pm_latency_ms: number;
    kh_latency_ms: number;
}

function getEnvFloat(key: string, defaultVal: number): number {
    const val = process.env[key];
    if (val && !isNaN(parseFloat(val))) {
        return parseFloat(val);
    }
    return defaultVal;
}

export function simulateTrade(input: SimulationInput): SimulationResult {
    // 1. Load Config
    const SIM_NOTIONAL = getEnvFloat('SIM_NOTIONAL', 100);
    const SIM_FEE_RATE_PM = getEnvFloat('SIM_FEE_RATE_PM', 0); // e.g. 0.01 = 1%
    const SIM_FEE_RATE_KH = getEnvFloat('SIM_FEE_RATE_KH', 0);
    const SIM_SLIPPAGE_BPS = getEnvFloat('SIM_SLIPPAGE_BPS', 10); // 10 bps = 0.1%
    const SIM_LATENCY_PENALTY_BPS_PER_100MS = getEnvFloat('SIM_LATENCY_PENALTY_BPS_PER_100MS', 1);

    const { pm_bid, pm_ask, kh_bid, kh_ask, pm_latency_ms, kh_latency_ms } = input;

    // 2. Validate Inputs (Tradeable Check Phase 1)
    const priceOk = 
        Number.isFinite(pm_bid) && 
        Number.isFinite(pm_ask) && 
        Number.isFinite(kh_bid) && 
        Number.isFinite(kh_ask);

    // Depth check is simplified here: if we have prices, we assume depth exists for top of book
    // Real depth check should happen upstream if possible, but here we just check prices
    const depthOk = priceOk; 

    if (!priceOk) {
        return {
            tradeable: false,
            direction: "NONE",
            gross_edge: null,
            net_edge: null,
            expected_profit: null,
            max_size_at_top: null,
            quality_score: 0,
            quality_tags: [],
            components: {
                fee_cost: 0,
                slippage_cost: 0,
                latency_penalty: 0,
                depth_ok: false,
                price_ok: false,
                reason: 'invalid_prices'
            }
        };
    }

    // 3. Calculate Edges
    // Direction A: Buy PM (Ask), Sell KH (Bid)
    // Direction B: Buy KH (Ask), Sell PM (Bid)
    
    // Safety cast since we checked priceOk
    const p_pm_ask = pm_ask as number;
    const p_pm_bid = pm_bid as number;
    const p_kh_bid = kh_bid as number;
    const p_kh_ask = kh_ask as number;

    const gross_edge_A = p_kh_bid - p_pm_ask;
    const gross_edge_B = p_pm_bid - p_kh_ask;

    let direction: "BUY_PM_SELL_KH" | "BUY_KH_SELL_PM" | "NONE" = "NONE";
    let gross_edge = 0;
    let entry_price = 0;
    let exit_price = 0;
    let fee_rate_entry = 0;
    let fee_rate_exit = 0;

    if (gross_edge_A > gross_edge_B) {
        direction = "BUY_PM_SELL_KH";
        gross_edge = gross_edge_A;
        entry_price = p_pm_ask;
        exit_price = p_kh_bid;
        fee_rate_entry = SIM_FEE_RATE_PM;
        fee_rate_exit = SIM_FEE_RATE_KH;
    } else {
        direction = "BUY_KH_SELL_PM";
        gross_edge = gross_edge_B;
        entry_price = p_kh_ask;
        exit_price = p_pm_bid;
        fee_rate_entry = SIM_FEE_RATE_KH;
        fee_rate_exit = SIM_FEE_RATE_PM;
    }

    // 4. Calculate Costs
    // Costs are calculated based on Notional
    // Qty = Notional / EntryPrice
    
    // Avoid division by zero
    if (entry_price <= 0 || exit_price <= 0) {
         return {
            tradeable: false,
            direction: "NONE",
            gross_edge: null,
            net_edge: null,
            expected_profit: null,
            max_size_at_top: null,
            quality_score: 0,
            quality_tags: [],
            components: {
                fee_cost: 0,
                slippage_cost: 0,
                latency_penalty: 0,
                depth_ok: true,
                price_ok: false, // Zero or negative price is invalid for execution
                reason: 'non_positive_price'
            }
        };
    }

    const qty = SIM_NOTIONAL / entry_price;

    // Fee Cost (Absolute $)
    // Fee on Entry + Fee on Exit
    // Entry Cost = Notional * fee_rate_entry
    // Exit Cost = (Qty * ExitPrice) * fee_rate_exit
    const fee_cost = (SIM_NOTIONAL * fee_rate_entry) + (qty * exit_price * fee_rate_exit);

    // Slippage Cost (Absolute $)
    // Slippage BPS applies to both legs? Or total execution? 
    // Usually slippage implies worse execution price. 
    // Let's model it as a cost: Notional * (BPS / 10000) * 2 (both legs)
    const slippage_cost = SIM_NOTIONAL * (SIM_SLIPPAGE_BPS / 10000) * 2; 

    // Latency Penalty (Absolute $)
    // Penalty based on total latency? Or max latency?
    // Let's use max(pm_latency, kh_latency) as the bottleneck
    const max_latency = Math.max(pm_latency_ms, kh_latency_ms);
    const latency_penalty_bps = (max_latency / 100) * SIM_LATENCY_PENALTY_BPS_PER_100MS;
    const latency_penalty = SIM_NOTIONAL * (latency_penalty_bps / 10000);

    // 5. Net Edge & Profit
    // Gross Profit = Qty * (ExitPrice - EntryPrice) = Qty * GrossEdge
    const gross_profit = qty * gross_edge;
    const expected_profit = gross_profit - fee_cost - slippage_cost - latency_penalty;
    
    // Net Edge (Price Terms)
    // Back-calculate what the edge implies in price terms per unit?
    // Or just expected_profit / Qty?
    // Let's use: net_edge = expected_profit / Qty
    const net_edge = expected_profit / qty;

    // 6. Tradeable Decision
    // Even if profit is negative, it might be "tradeable" but just a bad trade?
    // User said: "满足任一条件 => tradeable=false ... no_orderbook ... null ... depth_insufficient"
    // User didn't say negative profit makes it non-tradeable.
    // However, usually "tradeable opportunity" implies positive profit. 
    // But M1 goal is "Output tradeable count", usually implies valid market state.
    // Let's stick to market validity for 'tradeable', but profit can be negative.
    
    // Wait, user said: "Only tradable=true" as default filter.
    // And "对 tradeable=false：显示原因（no_orderbook/depth_insufficient/invalid_edge）"
    // This implies tradeable=true means the market is valid, even if profit is negative.
    
    // M2: Quality Tags & Score Logic
    const quality_tags: string[] = [];
    let quality_score = 100;
    const penalty_thin = 30;
    const penalty_slippage = 20;
    const penalty_latency = 20;
    const penalty_depth = 40; // Severe penalty for depth issues (simulated)

    // Check Depth (Simulated based on price existence for now, real depth check upstream)
    if (!depthOk) {
        quality_tags.push('depth_low');
        quality_score = Math.min(10, quality_score - penalty_depth);
    }

    if (expected_profit > 0) {
        // Thin Edge
        if (expected_profit <= 0 || (net_edge !== null && net_edge < 0.01)) {
            quality_tags.push('thin_edge');
            quality_score -= penalty_thin;
        }

        // Slippage Sensitive
        if (slippage_cost > expected_profit * 0.5) {
            quality_tags.push('slippage_sensitive');
            quality_score -= penalty_slippage;
        }

        // Latency Sensitive
        if (latency_penalty > expected_profit * 0.3) {
            quality_tags.push('latency_sensitive');
            quality_score -= penalty_latency;
        }
        
        // Bonus for high profit (optional, strictly speaking not requested but good for "quality")
        if (expected_profit > 5) {
            // No tag needed per spec, but we keep high_profit if useful, 
            // user spec says: "tags 加 high_profit" was in previous prompt, 
            // this prompt says: "thin_edge, slippage_sensitive, latency_sensitive, depth_low"
            // I'll keep high_profit as it was already there or just follow new strict rules.
            // User input A) says: "depth_low, thin_edge, slippage_sensitive, latency_sensitive"
            // It doesn't mention high_profit. I will remove high_profit to be strict, 
            // OR keep it if it doesn't hurt. The user's prompt in A) is quite specific.
            // I'll stick to the specific list in A) to be safe, but since I added high_profit in previous turn,
            // I'll leave it out of the *new* logic or just treat it as extra.
            // Actually, let's strictly follow A) for calculation logic.
        }
    } else {
        // Non-positive profit
        quality_score = 0;
    }

    // Clamp Score
    quality_score = Math.max(0, Math.min(100, quality_score));

    return {
        tradeable: true,
        direction,
        gross_edge,
        net_edge,
        expected_profit,
        max_size_at_top: null, // Not implemented yet
        quality_score,
        quality_tags,
        components: {
            fee_cost,
            slippage_cost,
            latency_penalty,
            depth_ok: true,
            price_ok: true
        }
    };
}
