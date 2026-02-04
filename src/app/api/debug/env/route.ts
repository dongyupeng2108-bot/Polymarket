
import { NextRequest, NextResponse } from 'next/server';
import { getProxyStatus } from '@/lib/utils/diagnostics';

export async function GET(request: NextRequest) {
    const proxy = getProxyStatus();
    
    // Mask values
    const mask = (val: string | null) => val ? val.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@') : null;

    return NextResponse.json({
        http_proxy: mask(proxy.http_proxy),
        https_proxy: mask(proxy.https_proxy),
        no_proxy: proxy.no_proxy,
        node_tls_reject_unauthorized: proxy.node_tls_reject_unauthorized,
        // Check if global agent is patched (generic check)
        global_agent_status: 'unknown (check per-request proxy_used)'
    });
}
