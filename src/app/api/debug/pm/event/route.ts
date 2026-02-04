import { NextRequest, NextResponse } from 'next/server';
import { fetchPolymarketEvent } from '@/lib/adapters/polymarket';

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const slug = searchParams.get('slug');

    if (!slug) {
        return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
    }

    try {
        const result = await fetchPolymarketEvent(slug);

        if (!result.success) {
            return NextResponse.json({
                error: result.meta.error_message || 'Failed to fetch event',
                debug: result.meta
            }, { status: result.meta.http_status || 500 });
        }

        const eventData = result.data;
        
        // Polymarket Gamma API returns the event object directly
        const markets = (eventData.markets || []).map((m: any) => {
            const outcomes = tryParseOutcomes(m.outcomes);
            const clobTokenIds = tryParseOutcomes(m.clobTokenIds); // sometimes string, sometimes array
            
            // Check for Yes/No
            const outcomesUpper = outcomes.map((o: any) => String(o).toUpperCase());
            const yesIndex = outcomesUpper.indexOf('YES');
            const noIndex = outcomesUpper.indexOf('NO');
            
            // User rule: "若 outcomes 含 Yes/No... 若不是二元..."
            // Usually binary markets have exactly 2 outcomes: Yes and No.
            // Some might have more but include Yes/No? Probably rare. 
            // We'll stick to: contains Yes AND No.
            
            let isBinary = false;
            let yesTokenId = null;
            let noTokenId = null;

            if (yesIndex !== -1 && noIndex !== -1) {
                isBinary = true;
                yesTokenId = clobTokenIds[yesIndex];
                noTokenId = clobTokenIds[noIndex];
            }

            const marketInfo: any = {
                pm_market_id: m.id,
                market_slug: m.slug,
                question: m.question,
                outcomes: outcomes,
                binary: isBinary
            };

            if (isBinary) {
                marketInfo.yes_token_id = yesTokenId;
                marketInfo.no_token_id = noTokenId;
            }

            return marketInfo;
        });

        return NextResponse.json({
            event_slug: eventData.slug,
            event_title: eventData.title,
            markets: markets,
            raw_debug: {
                latency_ms: result.meta.latency_ms,
                proxy_used: result.meta.proxy_used,
                url_used: result.meta.url_used
            }
        });

    } catch (err: any) {
        console.error('[API Error] /api/debug/pm/event:', err);
        return NextResponse.json({
            error: err.message || 'Internal Server Error'
        }, { status: 500 });
    }
}

function tryParseOutcomes(raw: any): any[] {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw);
        } catch {
            return [];
        }
    }
    return [];
}
