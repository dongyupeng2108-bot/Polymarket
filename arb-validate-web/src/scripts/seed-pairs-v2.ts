
import { prisma } from '../lib/db';
import { fetchWithPowerShell } from '../lib/utils/powershell-fetch';

const GAMMA_URL = 'https://gamma-api.polymarket.com';

const SEED_DATA = [
     { 
       label: "Fed decision in January", 
       pm_slug: "fed-rates", 
       pm_question_filter: "Fed decision in January",
       kh_ticker: "KXFEDDECISION-26JAN" 
     }, 
     { 
       label: "Jan CPI MoM", 
       pm_slug: "january-inflation-us-monthly", 
       kh_ticker: "KXCPI-26JAN" 
     }, 
     { 
       label: "Jan CPI YoY", 
       pm_slug: "january-inflation-us-annual-lower-brackets", 
       kh_ticker: "KXECONSTATCPIU-26JAN" 
     }, 
     { 
       label: "Jan Jobs Added", 
       pm_slug: "how-many-jobs-added-in-january", 
       kh_ticker: "KXPAYROLLS-26JAN" 
     }, 
     { 
       label: "Jan Unemployment Rate", 
       pm_slug: "will-the-january-2026-unemployment-rate-be-4pt7", 
       kh_ticker: "KXECONSTATU3-26JAN-T4.4" 
     } 
];

async function resolvePm(slug: string, questionFilter?: string) {
    try {
        console.log(`  Resolving PM slug: ${slug}`);
        let data = await fetchWithPowerShell(`${GAMMA_URL}/events?slug=${slug}`);
        if (data && data.value) data = data.value;
        let list = Array.isArray(data) ? data : (data ? [data] : []);
        
        if (list.length === 0 && questionFilter) {
             console.log(`  -> Slug failed, searching markets for: ${questionFilter}`);
             let sData = await fetchWithPowerShell(`${GAMMA_URL}/markets?q=${questionFilter}`);
             if (sData && sData.value) sData = sData.value;
             const mList = Array.isArray(sData) ? sData : (sData ? [sData] : []);
             if (mList.length > 0) {
                 list = [{
                     title: "Search Result",
                     slug: slug,
                     markets: mList
                 }];
             }
        }

        if (list.length === 0) {
            console.log(`  -> Event/Market not found for slug: ${slug}`);
            return null;
        }
        
        const event = list[0];
        let markets: any[] = [];
        if (event.markets) {
             let ms = (event.markets.value && Array.isArray(event.markets.value)) ? event.markets.value : event.markets;
             if (Array.isArray(ms)) markets = ms;
             else if (ms) markets = [ms];
        } else if (Array.isArray(event.markets)) {
            markets = event.markets;
        } else if (event.markets && event.markets.value) {
            markets = event.markets.value;
        } else {
             if (Array.isArray(event.markets)) markets = event.markets;
        }

        let targetMarket = markets[0];
        if (questionFilter) {
            const match = markets.find((m: any) => {
                const q = (m.value && m.value.question) ? m.value.question : m.question;
                return q && q.toLowerCase().includes(questionFilter.toLowerCase());
            });
            if (match) targetMarket = match;
        }

        if (!targetMarket) {
            console.log('  -> No market found in event');
            return null;
        }

        const m = (targetMarket.value && !targetMarket.question) ? targetMarket.value : targetMarket;
        
        let outcomes: string[] = [];
        let tokens: string[] = [];
        try {
            outcomes = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes;
            tokens = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds;
        } catch (e) {}

        if (outcomes && tokens && outcomes.length > 0 && tokens.length > 0) {
            let idx = outcomes.findIndex(o => o.toLowerCase() === 'yes');
            if (idx === -1) idx = 0;

            let noTokenId = null;
            if (outcomes.length === 2) {
                noTokenId = tokens.find((t: string, i: number) => i !== idx);
            }

            return {
                title: event.title || m.question,
                marketSlug: event.slug || slug, 
                yesTokenId: tokens[idx],
                noTokenId: noTokenId,
                question: m.question
            };
        }
    } catch (e: any) {
        console.error(`  PM Error: ${e.message}`);
    }
    return null;
}

async function resolveKh(ticker: string) {
    try {
        console.log(`  Resolving KH ticker: ${ticker}`);
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 5000);
        
        const res = await fetch(`https://api.elections.kalshi.com/trade-api/v2/markets/${ticker}`, {
            signal: controller.signal
        });
        clearTimeout(id);
        
        if (res.ok) {
            const json = await res.json();
            return {
                title: json.market?.title || ticker,
                ticker: json.market?.ticker || ticker
            };
        }
    } catch (e: any) {
        console.log(`  KH Fetch Error: ${e.message}`);
    }
    return { title: ticker, ticker: ticker };
}

async function main() {
    console.log('Seeding Pairs...');
    
    for (const item of SEED_DATA) {
        console.log(`Processing: ${item.label}`);
        
        const pm = await resolvePm(item.pm_slug, item.pm_question_filter);
        console.log(`  PM Resolved: ${pm ? 'Yes' : 'No'}`);
        
        const kh = await resolveKh(item.kh_ticker);
        console.log(`  KH Resolved: ${kh ? 'Yes' : 'No'}`);

        if (pm && kh) {
            const data = {
                title_pm: pm.title + (pm.question ? ` (${pm.question})` : ''),
                title_kh: kh.title,
                pm_yes_token_id: pm.yesTokenId,
                pm_no_token_id: pm.noTokenId,
                pm_market_slug: pm.marketSlug,
                kh_ticker: kh.ticker,
                kh_yes_contract_id: kh.ticker,
                status: 'ready' as any
            };

            const existing = await prisma.pair.findFirst({
                where: { pm_yes_token_id: pm.yesTokenId }
            });

            if (existing) {
                console.log(`  -> Pair already exists: #${existing.id}`);
            } else {
                console.log(`  Saving pair...`);
                const p = await prisma.pair.create({
                    data: {
                        ...data,
                        rules_pm: 'Seeded V2',
                        rules_kh: 'Seeded V2',
                        resolve_time_pm: new Date(),
                        resolve_time_kh: new Date(),
                    }
                });
                console.log(`  -> Created Pair #${p.id}`);
            }
        } else {
            console.log(`  -> Failed to resolve PM or KH. Skipping.`);
        }
    }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
