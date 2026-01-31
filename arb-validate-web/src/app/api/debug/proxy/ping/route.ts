
import { NextRequest, NextResponse } from 'next/server';
import { ProxySelector } from '@/lib/services/proxy-selector';

export async function GET(request: NextRequest) {
    const selector = ProxySelector.getInstance();
    // Health check updates states internally
    const rawResults = await selector.healthCheckAll();
    
    const best = selector.selectBestProfile();

    const formattedProfiles = rawResults.map(r => ({
        name: r.name,
        type: r.type,
        enabled: r.enabled,
        weight: r.weight,
        proxy_used: r.proxy_used,
        proxy_value_masked: r.proxy_value_masked,
        ok: r.ok,
        http_status: r.http_status,
        latency_ms: r.latency_ms,
        error_class: r.error_class,
        error_code: r.error_code,
        error_message: r.error_message,
        fail_reason: r.fail_reason,
        cooldown_until: r.cooldown_until
    }));

    let selectedBestResponse = {
        name: best.name,
        reason: best.reason,
        ok: best.ok,
        active_display: best.ok ? best.name : "None (all failed)",
        fail_details: best.ok ? null : (best.overall_fail_reason || best.reason)
    };

    return NextResponse.json({
        checked_at: new Date().toISOString(),
        target_host: "api.elections.kalshi.com",
        target_url: "https://api.elections.kalshi.com/trade-api/v2/exchange/status",
        selected_best: selectedBestResponse,
        profiles: formattedProfiles
    });
}
