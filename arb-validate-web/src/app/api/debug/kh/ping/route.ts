
import { NextRequest, NextResponse } from 'next/server';
import { checkKalshiHealth } from '@/lib/services/kalshi-diagnostics';

export async function GET(request: NextRequest) {
    const health = await checkKalshiHealth(true);
    
    // Flatten for debug endpoint to match previous evidence structure + new fields
    const response = {
        // Aggregated Fields (Single Source of Truth)
        kalshi_status: health.kalshi_status,
        reason: health.reason,
        fail_reason: health.reason, // Alias for backward compat if needed by UI momentarily
        http_status: health.http_status,
        latency_ms: health.latency_ms,
        stage: health.stage,
        error_code: health.error_code,
        error_message: health.error_message,
        url_used: health.url_used,
        last_checked_at: health.checked_at,

        // Detailed Evidence
        active_profile: health.details?.active_profile,
        dns: health.details?.dns,
        tcp: health.details?.tcp,
        tls: health.details?.tls,
        https: health.details?.https,
        auth_test: health.details?.auth_test,
        proxy_used: health.details?.proxy_used,
        proxy_profile: health.details?.proxy_profile,
        proxy_value_masked: health.details?.proxy_value_masked,
        final_status: health.kalshi_status // Alias
    };

    return NextResponse.json(response);
}
