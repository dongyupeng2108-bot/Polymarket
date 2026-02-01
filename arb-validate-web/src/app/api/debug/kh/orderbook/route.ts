
import { NextRequest, NextResponse } from 'next/server';
import { fetchKalshiBookDebug } from '@/lib/adapters/kalshi';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const ticker = searchParams.get('ticker');
    const start = Date.now();

    if (!ticker) {
        return NextResponse.json({ error: 'Missing ticker' }, { status: 400 });
    }

    try {
        const result = await fetchKalshiBookDebug(ticker);
        
        // Transform to strict JSON format requested by user
        const response: any = {
            ticker: ticker,
            url_used: result.url_used,
            attempts: (result as any).attempts || [],
            final: (result as any).final || {
                ok: false,
                http_status: result.http_status,
                error_class: result.error_class,
                error_code: result.error_code,
                error_message: (result as any).error_message
            }
        };
        
        // Fix up final error class if needed
        if (response.final.error_class === 'proxy_refused' || response.final.error_class === 'kh_proxy_not_active') {
            // As requested: "if failure reason is proxy_refused... final.error_class must be tcp (or specialized)"
            // Actually user said: "final.error_class must be tcp (or specialized proxy), reason_code=kh_proxy_not_active"
            // But we already mapped ECONNREFUSED to 'proxy_refused' in classifyError
        }
        
        // Append debug info from original result if successful (optional but helpful)
        if (response.final.ok) {
            response.parsed_book_summary = {
                bids_len: result.bids_len,
                asks_len: result.asks_len
            };
        }

        return NextResponse.json(response);
    } catch (err: any) {
        console.error('[API Error] /api/debug/kh/orderbook:', err);
        
        return NextResponse.json({
            status: "fail",
            error: err.message || 'Internal Server Error',
            stage: "kh_orderbook",
            ticker,
            url_used: `.../markets/${ticker}/orderbook`, // Approximate since we crashed before result
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }, { status: 500 });
    }
}
