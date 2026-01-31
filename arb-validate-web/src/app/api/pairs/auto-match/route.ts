import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { pmRequest } from '@/lib/adapters/polymarket';
import { khRequest } from '@/lib/adapters/kalshi';

function normalizeName(name: string): string {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export async function POST() {
    try {
        // 1. Fetch PM Events (Gamma)
        // Gamma API: https://gamma-api.polymarket.com/events?limit=50&active=true&closed=false
        const pmRes = await pmRequest('/events?limit=50&active=true&closed=false', {}, 'https://gamma-api.polymarket.com');
        const pmEvents = pmRes.success ? pmRes.data : [];
        
        // 2. Fetch Kalshi Markets
        const khRes = await khRequest('/markets?limit=100&status=active');
        const khMarkets = khRes.success ? (khRes.data.markets || []) : [];

        let matches = 0;
        
        // 3. Match
        for (const pm of pmEvents) {
            const pmNorm = normalizeName(pm.title);
            
            // Find best match in Kalshi
            const match = khMarkets.find((k: any) => {
                const kNorm = normalizeName(k.title);
                // Exact match or contains (heuristic)
                return kNorm === pmNorm;
            });
            
            if (match) {
                 // Check existence
                 const exists = await prisma.pair.findFirst({
                     where: {
                         OR: [
                             { pm_market_id: pm.id.toString() },
                             { kh_ticker: match.ticker }
                         ]
                     }
                 });
                 
                 if (!exists) {
                     // Find the binary market within the event
                     const pmMarket = pm.markets?.find((m: any) => m.outcomes?.length === 2) || pm.markets?.[0];
                     if (!pmMarket) continue;

                     // Extract tokens
                     let yesToken = null;
                     let noToken = null;
                     
                     if (pmMarket.outcomes && pmMarket.clobTokenIds) {
                         const outcomes = typeof pmMarket.outcomes === 'string' ? JSON.parse(pmMarket.outcomes) : pmMarket.outcomes;
                         const tokens = typeof pmMarket.clobTokenIds === 'string' ? JSON.parse(pmMarket.clobTokenIds) : pmMarket.clobTokenIds;
                         
                         const yesIdx = outcomes.findIndex((o: string) => o.toLowerCase() === 'yes');
                         const noIdx = outcomes.findIndex((o: string) => o.toLowerCase() === 'no');
                         
                         if (yesIdx !== -1) yesToken = tokens[yesIdx];
                         if (noIdx !== -1) noToken = tokens[noIdx];
                     }

                     if (!yesToken) continue; // Skip if can't identify YES token

                     await prisma.pair.create({
                         data: {
                             title_pm: pm.title,
                             title_kh: match.title,
                             pm_market_id: pm.id.toString(),
                             pm_market_slug: pm.slug,
                             pm_yes_token_id: yesToken,
                             pm_no_token_id: noToken,
                             pm_open_url: `https://polymarket.com/event/${pm.slug}`,
                             
                             kh_ticker: match.ticker,
                             kh_yes_contract_id: match.ticker,
                             kh_open_url: `https://kalshi.com/markets/${match.ticker}`, 
                             
                             resolve_time_pm: new Date(pm.endDate || Date.now()),
                            resolve_time_kh: new Date(match.close_date || Date.now()),
                            rules_pm: '', // Default empty
                            rules_kh: '', // Default empty
                            
                            status: 'unverified',
                             confidence: 0,
                             is_binary: true
                         }
                     });
                     matches++;
                 }
            }
        }
        
        return NextResponse.json({ success: true, matches });

    } catch (e: any) {
        console.error('Auto match error:', e);
        return NextResponse.json({ error: e.message || 'Auto match failed' }, { status: 500 });
    }
}
