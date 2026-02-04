
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { scanPairs, ScanResult } from '@/lib/services/scanner';

export async function POST(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    
    // Parse JSON body if available
    let body: any = {};
    try {
        const contentType = request.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            body = await request.json();
        }
    } catch (e) {
        // Ignore invalid JSON
    }

    const mode = searchParams.get('mode') || body.mode || 'single';
    const eventTicker = searchParams.get('eventTicker') || body.eventTicker;
    const pairIdsParam = searchParams.get('pairIds') || body.pairIds; // String or Array (from body)
    const limitStr = searchParams.get('limit') || body.limit || '50';
    const minEdgeStr = searchParams.get('min_edge') || body.min_edge;
    const maxPairsStr = searchParams.get('maxPairs') || body.maxPairs || '200';
    const shuffle = (searchParams.get('shuffle') || body.shuffle) !== 'false';

    // 1. Determine Target Pairs
    let pairIds: number[] = [];
    let scanMeta: any = { scanMode: mode };
    
    if (pairIdsParam) {
        let rawIds: number[] = [];
        if (Array.isArray(pairIdsParam)) {
             rawIds = pairIdsParam.map((n: any) => parseInt(n, 10)).filter((n: number) => !isNaN(n));
        } else {
             rawIds = String(pairIdsParam).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        }

        // Enforce VERIFIED status check
        const verifiedPairs = await prisma.pair.findMany({
            where: {
                id: { in: rawIds },
                status: 'verified'
            },
            select: { id: true }
        });

        pairIds = verifiedPairs.map(p => p.id);
        scanMeta.scannedEventTickers = 'MANUAL_IDS';
        scanMeta.requestedIdsCount = rawIds.length;
        scanMeta.verifiedIdsCount = pairIds.length;
    } else if (mode === 'all') {
        // Fetch all verified pairs
        const pairs = await prisma.pair.findMany({
            where: {
                status: 'verified'
            },
            select: { id: true, kh_ticker: true }
        });
        
        // Count tickers
        const tickers = new Set(pairs.map(p => p.kh_ticker).filter(Boolean));
        scanMeta.scannedEventTickersCount = tickers.size;
        
        let targetPairs = pairs;
        
        // Shuffle
        if (shuffle) {
            for (let i = targetPairs.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [targetPairs[i], targetPairs[j]] = [targetPairs[j], targetPairs[i]];
            }
        }
        
        // Limit
        const maxPairs = parseInt(maxPairsStr, 10);
        targetPairs = targetPairs.slice(0, maxPairs);
        
        pairIds = targetPairs.map(p => p.id);
        
    } else if (eventTicker) {
        // Find pairs by Kalshi ticker prefix
        // User requirement: event_ticker = base OR event_ticker LIKE base + '-%'
        // We use startsWith in DB for performance, then refine in memory for correctness.
        const allPairs = await prisma.pair.findMany({
            where: {
                kh_ticker: {
                    startsWith: eventTicker
                },
                status: 'verified' // Only scan verified pairs
            },
            // For Single Event Scan, we want ALL sub-markets, so we increase the limit significantly
            take: 1000,
            select: { id: true, kh_ticker: true }
        });

        // Refine filtering: strict match or base + '-' prefix
        // This prevents 'ABC' from matching 'ABCDEF' (different event), only 'ABC-DEF' (sub-market)
        const validPairs = allPairs.filter(p => {
             const t = p.kh_ticker;
             if (!t) return false;
             return t === eventTicker || t.startsWith(eventTicker + '-');
        });

        // Apply Limit
        const limit = parseInt(limitStr, 10);
        const finalPairs = (!isNaN(limit) && limit > 0) ? validPairs.slice(0, limit) : validPairs;

        pairIds = finalPairs.map(p => p.id);
        
        scanMeta.scannedEventTickers = eventTicker;
        scanMeta.resolvedEventTickersCount = finalPairs.length;
        scanMeta.resolvedEventTickersSample = finalPairs.slice(0, 5).map(p => p.kh_ticker || '');
    } else {
        return NextResponse.json({ 
            error: 'Must provide eventTicker or pairIds',
            received: {
                mode,
                eventTicker: eventTicker || null,
                pairIds: pairIdsParam || null,
                queryKeys: Array.from(searchParams.keys()),
                hasBody: Object.keys(body).length > 0
            }
        }, { status: 400 });
    }

    scanMeta.scannedPairs = pairIds.length;

    if (pairIds.length === 0) {
        return NextResponse.json({ 
            ok: true, 
            meta: scanMeta,
            results: [], 
            summary: { opportunity: 0, no_opportunity: 0, error: 0 } 
        });
    }

    // 1.5 Create ScanRun Record
    const scanRun = await prisma.scanRun.create({
        data: {
            status: 'running',
            pairs_processed: 0
        }
    });

    // 2. Scan Logic with Unified Concurrency Control
    // Use centralized scanPairs with built-in concurrency (default 5)
    const overrides = minEdgeStr ? { minEdge: parseFloat(minEdgeStr) } : undefined;
    const results = await scanPairs(pairIds, 5, overrides);

    // 2.5 Update ScanRun Record
    await prisma.scanRun.update({
        where: { id: scanRun.id },
        data: {
            status: 'completed',
            completed_at: new Date(),
            pairs_processed: results.length
        }
    });

    // 3. Summarize
    const validResults = results.filter(r => r.simulation && r.simulation.tradeable);
    
    // Profit Stats
    const profits = validResults
        .map(r => r.simulation?.expected_profit || 0)
        .sort((a, b) => a - b);
    
    const profitStats = {
        min: profits.length > 0 ? profits[0] : 0,
        max: profits.length > 0 ? profits[profits.length - 1] : 0,
        avg: profits.length > 0 ? profits.reduce((a, b) => a + b, 0) / profits.length : 0,
        p50: profits.length > 0 ? profits[Math.floor(profits.length * 0.5)] : 0,
        p90: profits.length > 0 ? profits[Math.floor(profits.length * 0.9)] : 0,
    };

    // Quality Stats
    const qualityScores = validResults
        .map(r => r.simulation?.quality_score || 0)
        .sort((a, b) => a - b);
    
    const qualityStats = {
        min: qualityScores.length > 0 ? qualityScores[0] : 0,
        max: qualityScores.length > 0 ? qualityScores[qualityScores.length - 1] : 0,
        avg: qualityScores.length > 0 ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : 0,
        p50: qualityScores.length > 0 ? qualityScores[Math.floor(qualityScores.length * 0.5)] : 0,
        p90: qualityScores.length > 0 ? qualityScores[Math.floor(qualityScores.length * 0.9)] : 0,
    };
    
    // Reason Breakdown & Categorization
    const reasonBreakdown: Record<string, number> = {};
    const categoryBreakdown: Record<string, number> = {
        'network': 0,
        'depth': 0,
        'data': 0,
        'other': 0
    };

    results.forEach(r => {
        if (r.result === 'ERROR') {
            // Log failure reasons (M2 Requirement)
            const errorReason = r.error || r.reason || 'Unknown Error';
            reasonBreakdown[errorReason] = (reasonBreakdown[errorReason] || 0) + 1;
            
            if (errorReason.toLowerCase().includes('network') || errorReason.toLowerCase().includes('fetch') || errorReason.toLowerCase().includes('snapshot')) {
                categoryBreakdown['network']++;
            } else {
                categoryBreakdown['other']++;
            }
        } else if (r.result !== 'OPPORTUNITY') {
            const code = r.reason_code || 'unknown';
            reasonBreakdown[code] = (reasonBreakdown[code] || 0) + 1;
            
            // Categorize
            if (code.includes('network') || code.includes('http') || code.includes('timeout')) {
                categoryBreakdown['network']++;
            } else if (code.includes('depth') || code.includes('no_orderbook')) {
                categoryBreakdown['depth']++;
            } else if (code.includes('edge') || code.includes('price') || code.includes('contract') || code.includes('binary')) {
                categoryBreakdown['data']++;
            } else {
                categoryBreakdown['other']++;
            }
        }
    });

    const summary = {
        opportunity: results.filter(r => r.result === 'OPPORTUNITY').length,
        no_opportunity: results.filter(r => r.result === 'NO_OPPORTUNITY').length,
        error: results.filter(r => r.result === 'ERROR').length,
        
        // M1 Simulation Stats
        tradeable_count: validResults.length,
        net_positive_count: validResults.filter(r => (r.simulation?.expected_profit || 0) > 0).length,
        expected_profit_sum: validResults.reduce((sum, r) => sum + (r.simulation?.expected_profit || 0), 0),
        
        // M2 Enhanced Stats
        profit_percentiles: profitStats,
        quality_percentiles: qualityStats,
        
        // M2 Top Opportunities
        top_opportunities_by_profit: validResults
            .sort((a, b) => (b.simulation?.expected_profit || 0) - (a.simulation?.expected_profit || 0))
            .slice(0, 10)
            .map(r => ({
                pair_id: r.pair_id,
                expected_profit_usd: r.simulation?.expected_profit,
                quality_score: r.simulation?.quality_score,
                tags: r.simulation?.quality_tags,
                reason_code: r.reason_code,
                tickers: r.tickers,
                eventTicker: r.tickers?.kh
            })),
            
        top_opportunities_by_quality: validResults
            .sort((a, b) => (b.simulation?.quality_score || 0) - (a.simulation?.quality_score || 0))
            .slice(0, 10)
            .map(r => ({
                pair_id: r.pair_id,
                expected_profit_usd: r.simulation?.expected_profit,
                quality_score: r.simulation?.quality_score,
                tags: r.simulation?.quality_tags,
                reason_code: r.reason_code,
                tickers: r.tickers,
                eventTicker: r.tickers?.kh
            })),

        // M2 Reason Stats
        reason_breakdown: reasonBreakdown,
        category_breakdown: categoryBreakdown
    };

    return NextResponse.json({
        ok: true,
        meta: scanMeta,
        eventTicker,
        scanned: results.length,
        results,
        summary
    });
}
