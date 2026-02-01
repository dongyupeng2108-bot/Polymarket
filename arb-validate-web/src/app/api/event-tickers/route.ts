import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
    try {
        // 1. Get raw stats grouped by full ticker
        const results = await prisma.$queryRaw`
            SELECT 
                kh_ticker as "eventTicker",
                COUNT(*)::int as "pairCount",
                SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END)::int as "verifiedCount"
            FROM pairs
            WHERE kh_ticker IS NOT NULL
            GROUP BY kh_ticker
        `;
        
        // 2. Aggregate in Memory by Base Ticker
        const aggMap = new Map<string, { pairCount: number, verifiedCount: number }>();

        (results as any[]).forEach(r => {
            const rawTicker = r.eventTicker as string;
            const pCount = Number(r.pairCount);
            const vCount = Number(r.verifiedCount);

            // Determine Base Ticker
            // Heuristic: Split by '-', remove last part if length > 1
            const parts = rawTicker.split('-');
            let baseTicker = rawTicker;
            
            if (parts.length > 1) {
                // Check if last part looks like a suffix (usually it is)
                // We simply strip the last part to group siblings
                baseTicker = parts.slice(0, -1).join('-');
            }

            // Update Aggregation
            const current = aggMap.get(baseTicker) || { pairCount: 0, verifiedCount: 0 };
            current.pairCount += pCount;
            current.verifiedCount += vCount;
            aggMap.set(baseTicker, current);
        });

        // 3. Convert to Array and Sort
        const items = Array.from(aggMap.entries()).map(([ticker, stats]) => ({
            eventTicker: ticker,
            pairCount: stats.pairCount,
            verifiedCount: stats.verifiedCount
        }));

        // Sort by pairCount DESC
        items.sort((a, b) => b.pairCount - a.pairCount);

        return NextResponse.json({ items });
    } catch (e: any) {
        console.error('Failed to fetch event tickers:', e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
