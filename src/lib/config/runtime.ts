
// This file manages runtime configuration for the application.
// It centralizes logic for thresholds, modes, and feature flags.

export interface RuntimeConfig {
    opp_mode: 'dev' | 'prod';
    opp_threshold: number;
    opp_threshold_source: string;
    proxy_env_present: boolean;
    warning?: boolean;
    warning_reason?: string;
    sim: {
        notional: number;
        fee_rate_pm: number;
        fee_rate_kh: number;
        slippage_bps: number;
        latency_penalty_bps_per_100ms: number;
    };
}

function getEnvFloat(key: string, defaultVal: number): number {
    const val = process.env[key];
    if (val && !isNaN(parseFloat(val))) {
        return parseFloat(val);
    }
    return defaultVal;
}

export function getRuntimeConfig(): RuntimeConfig {
    const mode = (process.env.OPP_MODE === 'dev' || process.env.OPP_MODE === 'prod') 
        ? process.env.OPP_MODE 
        : 'prod'; // Default to prod if not set (safer)

    // Threshold Logic:
    // 1. If mode is dev, prefer OPP_EDGE_THRESHOLD_DEV
    // 2. If not set or mode is prod, use OPP_EDGE_THRESHOLD
    // 3. Fallback to default (0.01) if neither is valid number
    
    let thresholdRaw: string | undefined;
    let source: string = 'fallback';
    
    if (mode === 'dev') {
        if (process.env.OPP_EDGE_THRESHOLD_DEV) {
            thresholdRaw = process.env.OPP_EDGE_THRESHOLD_DEV;
            source = 'OPP_EDGE_THRESHOLD_DEV';
        } else {
            thresholdRaw = process.env.OPP_EDGE_THRESHOLD;
            source = 'OPP_EDGE_THRESHOLD';
        }
    } else {
        if (process.env.OPP_EDGE_THRESHOLD) {
            thresholdRaw = process.env.OPP_EDGE_THRESHOLD;
            source = 'OPP_EDGE_THRESHOLD';
        }
    }

    let threshold = 0.01; // Default
    if (thresholdRaw && !isNaN(parseFloat(thresholdRaw))) {
        threshold = parseFloat(thresholdRaw);
    } else {
        // If the selected source was invalid or missing, we fell back to default
        source = 'fallback';
        // Check if legacy fallback exists (just in case logic above missed something, though it shouldn't)
        if (process.env.OPP_EDGE_THRESHOLD && !isNaN(parseFloat(process.env.OPP_EDGE_THRESHOLD))) {
             threshold = parseFloat(process.env.OPP_EDGE_THRESHOLD);
             source = 'OPP_EDGE_THRESHOLD';
        }
    }

    // PROD SAFEGUARD: Enforce positive threshold in production
    let warning = false;
    let warningReason: string | undefined = undefined;

    if (mode === 'prod' && threshold <= 0) {
        threshold = 0.01;
        source += ' (fallback)';
        warning = true;
        warningReason = 'prod_threshold_invalid_fallback';
    }
    
    return {
        opp_mode: mode,
        opp_threshold: threshold,
        opp_threshold_source: source,
        proxy_env_present: !!(process.env.HTTPS_PROXY || process.env.HTTP_PROXY),
        warning,
        warning_reason: warningReason,
        sim: {
            notional: getEnvFloat('SIM_NOTIONAL', 100),
            fee_rate_pm: getEnvFloat('SIM_FEE_RATE_PM', 0),
            fee_rate_kh: getEnvFloat('SIM_FEE_RATE_KH', 0),
            slippage_bps: getEnvFloat('SIM_SLIPPAGE_BPS', 10),
            latency_penalty_bps_per_100ms: getEnvFloat('SIM_LATENCY_PENALTY_BPS_PER_100MS', 1)
        }
    };
}
