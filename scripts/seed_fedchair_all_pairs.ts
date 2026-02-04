
import { prisma } from '../src/lib/db';
import { fetchPolymarketEvent } from '../src/lib/adapters/polymarket';
import { khRequest } from '../src/lib/adapters/kalshi';
import * as fs from 'fs';
import * as path from 'path';

// --- Configuration ---
const KALSHI_EVENT_TICKER = 'KXFEDCHAIRNOM-29';
const PM_EVENT_SLUG = 'who-will-trump-nominate-as-fed-chair';
const OUTPUT_FILE = path.join(process.cwd(), 'out', 'fedchair_seed_report.json');

// --- Types ---
interface CandidateMatch {
    name_normalized: string;
    pm_data: {
        market_id: string;
        market_slug: string;
        question: string;
        yes_token_id: string;
        no_token_id: string;
    };
    kh_data: {
        ticker: string;
        title: string;
        subtitle?: string;
    };
    pair_id?: number;
    match_method: string;
}

interface UnmatchedItem {
    source: 'PM' | 'KH';
    id: string; // market_id or ticker
    name_raw: string;
    name_normalized: string;
    details: any;
}

// --- Helpers ---

function normalizeName(name: string): string {
    if (!name) return '';
    return name.toLowerCase()
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") // Remove punctuation
        .replace(/\s{2,}/g, " ") // Remove extra spaces
        .trim();
}

function extractPmName(question: string): string {
    // Expected format: "Will Trump nominate Kevin Warsh as the next Fed chair?"
    // Regex: nominate (.+?) as
    const match = question.match(/nominate\s+(.+?)\s+as/i);
    if (match && match[1]) {
        return match[1];
    }
    // Fallback: just return the whole question if regex fails (unlikely for this event)
    return question;
}

function extractKhName(market: any): string {
    // Kalshi markets for candidates usually have title like "Kevin Warsh" or "Fed Chair Nominee: Kevin Warsh"
    // Or subtitle might contain the name.
    // For this specific event, based on previous interactions, title is "Fed Chair Nominee: Kevin Warsh"
    // But let's handle "Name" directly if possible, or parse Title.
    
    let raw = market.title;
    if (market.subtitle) raw = market.subtitle; // sometimes subtitle is cleaner
    
    // Try to strip "Fed Chair Nominee:" prefix if present
    const prefix = "fed chair nominee:";
    if (raw.toLowerCase().startsWith(prefix)) {
        return raw.substring(prefix.length).trim();
    }
    return raw;
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

async function main() {
    console.log(`--- Seeding Fed Chair Pairs ---`);
    console.log(`PM Event: ${PM_EVENT_SLUG}`);
    console.log(`KH Event: ${KALSHI_EVENT_TICKER}`);

    // 1. Fetch Data
    console.log('\n1. Fetching Polymarket Data...');
    const pmRes = await fetchPolymarketEvent(PM_EVENT_SLUG);
    if (!pmRes.success) {
        console.error('Failed to fetch PM event:', pmRes.meta);
        process.exit(1);
    }
    const pmMarketsRaw = pmRes.data.markets || [];
    console.log(`   Found ${pmMarketsRaw.length} PM markets.`);

    console.log('\n2. Fetching Kalshi Data...');
    const khRes = await khRequest(`/markets?event_ticker=${KALSHI_EVENT_TICKER}`);
    if (!khRes.success) {
        console.error('Failed to fetch KH markets:', khRes.meta);
        process.exit(1);
    }
    const khMarketsRaw = khRes.data.markets || [];
    console.log(`   Found ${khMarketsRaw.length} KH markets.`);

    // 2. Pre-process Lists
    const pmCandidates: any[] = [];
    const khCandidates: any[] = [];

    // Process PM
    for (const m of pmMarketsRaw) {
        // clobTokenIds is array corresponding to outcomes
        // We need index of Yes
        const outcomes = tryParseOutcomes(m.outcomes);
        const clobTokenIds = tryParseOutcomes(m.clobTokenIds);
        
        if (!outcomes.includes('Yes') || !outcomes.includes('No')) {
            continue; // Skip non-binary
        }
        
        const yesIndex = outcomes.indexOf('Yes');
        const noIndex = outcomes.indexOf('No');
        
        if (yesIndex === -1 || clobTokenIds.length <= yesIndex) continue;

        const rawName = extractPmName(m.question);
        pmCandidates.push({
            id: m.id,
            slug: m.slug,
            question: m.question,
            description: m.description,
            yes_token_id: clobTokenIds[yesIndex],
            no_token_id: clobTokenIds[noIndex],
            name_raw: rawName,
            name_norm: normalizeName(rawName)
        });
    }

    // Process KH
    for (const m of khMarketsRaw) {
        const rawName = extractKhName(m);
        khCandidates.push({
            ticker: m.ticker,
            title: m.title,
            subtitle: m.subtitle,
            open_date: m.open_date,
            name_raw: rawName,
            name_norm: normalizeName(rawName)
        });
    }

    // 3. Matching
    console.log('\n3. Matching Candidates...');
    
    const matches: CandidateMatch[] = [];
    const unmatchedPm: UnmatchedItem[] = [];
    const unmatchedKh: UnmatchedItem[] = [];
    
    // Track used IDs to find unmatched later
    const matchedPmIds = new Set<string>();
    const matchedKhTickers = new Set<string>();

    // Strategy: Iterate PM candidates and look for KH match
    // Why? PM usually has the specific question format we parsed.
    
    for (const pm of pmCandidates) {
        let bestMatch: any = null;
        let matchMethod = '';

        // 3.1 Exact Normalized Match
        bestMatch = khCandidates.find(k => k.name_norm === pm.name_norm);
        if (bestMatch) {
            matchMethod = 'exact_norm';
        }

        // 3.2 Contains Match (if no exact)
        if (!bestMatch) {
            bestMatch = khCandidates.find(k => {
                // Check if PM contains KH or KH contains PM
                // e.g. "Kevin Warsh" vs "Warsh"
                return pm.name_norm.includes(k.name_norm) || k.name_norm.includes(pm.name_norm);
            });
            if (bestMatch) {
                matchMethod = 'contains';
            }
        }

        if (bestMatch) {
            matches.push({
                name_normalized: pm.name_norm,
                pm_data: {
                    market_id: pm.id,
                    market_slug: pm.slug,
                    question: pm.question,
                    yes_token_id: pm.yes_token_id,
                    no_token_id: pm.no_token_id
                },
                kh_data: {
                    ticker: bestMatch.ticker,
                    title: bestMatch.title,
                    subtitle: bestMatch.subtitle
                },
                match_method: matchMethod
            });
            matchedPmIds.add(pm.id);
            matchedKhTickers.add(bestMatch.ticker);
        } else {
            unmatchedPm.push({
                source: 'PM',
                id: pm.id,
                name_raw: pm.name_raw,
                name_normalized: pm.name_norm,
                details: { question: pm.question }
            });
        }
    }

    // Find Unmatched KH
    for (const kh of khCandidates) {
        if (!matchedKhTickers.has(kh.ticker)) {
            unmatchedKh.push({
                source: 'KH',
                id: kh.ticker,
                name_raw: kh.name_raw,
                name_normalized: kh.name_norm,
                details: { title: kh.title }
            });
        }
    }

    console.log(`   Matches Found: ${matches.length}`);
    console.log(`   Unmatched PM: ${unmatchedPm.length}`);
    console.log(`   Unmatched KH: ${unmatchedKh.length}`);

    // 4. Upsert to DB
    console.log('\n4. Upserting Pairs to DB...');
    
    for (const match of matches) {
        const { pm_data, kh_data } = match;
        
        // Construct Pair Data
        const pairData = {
            kh_ticker: kh_data.ticker,
            pm_yes_token_id: pm_data.yes_token_id,
            pm_no_token_id: pm_data.no_token_id,
            is_binary: true,
            
            pm_market_slug: pm_data.market_slug,
            pm_market_id: pm_data.market_id,
            pm_open_url: `https://polymarket.com/event/${PM_EVENT_SLUG}`,
            
            kh_open_url: `https://kalshi.com/markets/${kh_data.ticker.split('-')[0]}`, // Approximation
            
            title_pm: pm_data.question,
            title_kh: kh_data.title,
            
            // Default rules
            rules_pm: 'See platform',
            rules_kh: 'See platform',
            
            // Dummy resolve time (will be updated by scan if needed, or we could parse from event if we had it)
            resolve_time_pm: new Date('2025-02-01'), 
            resolve_time_kh: new Date('2025-02-01'),
            
            status: 'verified' as const
        };

        try {
            // kh_ticker is not unique in schema, so we use findFirst + update/create
            const existing = await prisma.pair.findFirst({
                where: { kh_ticker: pairData.kh_ticker }
            });

            let pair;
            if (existing) {
                pair = await prisma.pair.update({
                    where: { id: existing.id },
                    data: pairData
                });
            } else {
                pair = await prisma.pair.create({
                    data: pairData
                });
            }
            
            match.pair_id = pair.id;
            // console.log(`   Saved: ${kh_data.ticker} <-> ${pm_data.market_slug} (ID: ${pair.id})`);
        } catch (e: any) {
            console.error(`   Error saving ${kh_data.ticker}:`, e.message);
        }
    }

    // 5. Generate Report
    console.log('\n5. Generating Report...');
    const report = {
        timestamp: new Date().toISOString(),
        summary: {
            matched: matches.length,
            unmatched_pm: unmatchedPm.length,
            unmatched_kh: unmatchedKh.length
        },
        matches: matches.map(m => ({
            pair_id: m.pair_id,
            candidate: m.name_normalized,
            kh_ticker: m.kh_data.ticker,
            pm_id: m.pm_data.market_id,
            method: m.match_method
        })),
        unmatched_pm: unmatchedPm,
        unmatched_kh: unmatchedKh
    };

    if (!fs.existsSync(path.dirname(OUTPUT_FILE))) {
        fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    }
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
    console.log(`   Report saved to: ${OUTPUT_FILE}`);
    
    // 6. Verification Suggestions
    console.log('\n--- Verification ---');
    if (matches.length > 0) {
        console.log('Sample Pair IDs for Scan:');
        matches.slice(0, 3).forEach(m => {
            console.log(`- ID ${m.pair_id}: ${m.name_normalized} (${m.kh_data.ticker})`);
        });
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
