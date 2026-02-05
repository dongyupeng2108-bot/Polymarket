
import { NextRequest, NextResponse } from 'next/server';
import { fetchPolymarketBookDebug } from '@/lib/adapters/polymarket';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const tokenId = searchParams.get('token_id');

    if (!tokenId) {
        return NextResponse.json({ error: 'Missing token_id' }, { status: 400 });
    }

    try {
        const result = await fetchPolymarketBookDebug(tokenId);
        
        // Calculate best bid/ask
        let bestBid = null;
        let bestAsk = null;

        if (result.parsed_book) {
            if (result.parsed_book.bids && result.parsed_book.bids.length > 0) {
                // Assuming bids are not sorted, find max
                bestBid = result.parsed_book.bids.reduce((max, b) => b.price > max ? b.price : max, 0);
            }
            if (result.parsed_book.asks && result.parsed_book.asks.length > 0) {
                // Assuming asks are not sorted, find min
                bestAsk = result.parsed_book.asks.reduce((min, a) => a.price < min ? a.price : min, 1); // Max price is 1
            }
        }

        const response: any = {
            token_id: tokenId,
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

        if (response.final.ok) {
            response.parsed_book_summary = {
                bids_len: result.bids_len,
                asks_len: result.asks_len,
                best_bid: bestBid,
                best_ask: bestAsk
            };
        }

        // Ensure top-level fields requested by user are present or easily accessible
        // "必含：http_status, error_class, error_code, error_message, latency_ms, url_used, proxy_used, proxy_value_masked"
        // These are mostly in 'final' or root, but let's make sure the root has them if the user wants a flat structure.
        // However, the user said "align with /api/debug/kh/orderbook". 
        // The KH route returns a nested structure. I will stick to the nested structure but ensure all info is there.
        // I will add the top-level debug fields to the response root as well for convenience if that's what "align" means + "must contain".
        
        response.http_status = result.http_status;
        response.latency_ms = result.latency_ms;
        response.proxy_used = result.proxy_used;
        response.proxy_value_masked = (result as any).proxy_value; // fetchPolymarketBookDebug returns proxy_value (masked in pmRequest)

        return NextResponse.json(response);

    } catch (err: any) {
        console.error('[API Error] /api/debug/pm/orderbook:', err);
        
        return NextResponse.json({
            status: "fail",
            error: err.message || 'Internal Server Error',
            stage: "pm_orderbook",
            token_id: tokenId,
            url_used: `.../book?token_id=${tokenId}`,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }, { status: 500 });
    }
}
