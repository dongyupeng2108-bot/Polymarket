
import fs from 'fs';
import path from 'path';

// Load .env manually since dotenv is not available
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|["']$/g, '');
            process.env[key] = value;
        }
    });
}

// Global variables for dynamic loading
let prisma: any;
let khRequest: any;
let pmRequest: any;
let PairStatus: any;

const OUT_DIR = path.resolve(process.cwd(), 'out');
if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR);
}

// --- Utils ---
function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function normalize(str: string): string {
    if (!str) return '';
    // Minimal stop words to avoid killing valid matches
    const stopWords = new Set([
        'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'by', 
        'is', 'are', 'was', 'were', 'and', 'or', 'that', 'this', 
        'from', 'with', 'market'
    ]);

    return str.toLowerCase()
        .replace(/[^\w\s]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ')    // Collapse spaces
        .trim()
        .split(' ')
        .filter(w => w.length > 2 && !stopWords.has(w)) 
        .join(' ');
}

// --- C1: Kalshi Fetch ---
async function fetchKalshiMarkets() {
    console.log('Starting Kalshi Fetch...');
    let allMarkets: any[] = [];
    let cursor: string | undefined = undefined;
    const LIMIT = 200; // Increase limit
     const TARGET_VALID = 2500; // Target valid markets
     let loopCount = 0;
     const MAX_LOOPS = 1000; // Safety break

    while (allMarkets.length < TARGET_VALID && loopCount < MAX_LOOPS) {
        loopCount++;
        console.log(`Fetching Kalshi... valid count: ${allMarkets.length}, loop: ${loopCount}, cursor: ${cursor || 'start'}`);
        try {
            const params: any = { limit: LIMIT, status: 'open' };
            if (cursor) params.cursor = cursor;

            const res = await khRequest('/markets', { params });
            if (!res.success) {
                console.error('Kalshi fetch failed:', res.meta);
                break;
            }

            const markets = res.data.markets || [];
            if (markets.length === 0) break;

            // Filter out clearly complex ones (Multivariate)
            const cleanMarkets = markets.filter((m: any) => 
                !m.ticker.startsWith('KXMV') 
            );
            
            allMarkets.push(...cleanMarkets);
            cursor = res.data.cursor;

            if (!cursor) break;
            await sleep(100); 
        } catch (e) {
            console.error('Kalshi loop error:', e);
            break;
        }
    }

    fs.writeFileSync(path.join(OUT_DIR, 'kalshi_markets.json'), JSON.stringify(allMarkets, null, 2));
    console.log(`Saved ${allMarkets.length} Kalshi markets (filtered).`);
    return allMarkets;
}

// --- C2: Polymarket Fetch ---
async function fetchPolymarketMarkets() {
    console.log('Starting Polymarket Fetch...');
    let allMarkets: any[] = [];
    let offset = 0;
    const LIMIT = 100;
    const MAX_MARKETS = 3000; 
    const GAMMA_URL = 'https://gamma-api.polymarket.com';

    while (allMarkets.length < MAX_MARKETS) {
        console.log(`Fetching Polymarket... current count: ${allMarkets.length}, offset: ${offset}`);
        try {
            const params = { 
                limit: LIMIT, 
                offset: offset, 
                enableOrderBook: 'true',
                active: 'true',
                closed: 'false'
            };

            const res = await pmRequest('/markets', { params }, GAMMA_URL);
            if (!res.success) {
                console.error('PM fetch failed:', res.meta);
                break;
            }

            const markets = res.data;
            if (!Array.isArray(markets) || markets.length === 0) break;

            allMarkets.push(...markets);
            offset += LIMIT;
            
            await sleep(200);
        } catch (e) {
            console.error('PM loop error:', e);
            break;
        }
    }

    fs.writeFileSync(path.join(OUT_DIR, 'pm_markets.json'), JSON.stringify(allMarkets, null, 2));
    console.log(`Saved ${allMarkets.length} Polymarket markets.`);
    return allMarkets;
}

// --- C3: Matching & Seeding ---
async function matchAndSeed(kMarkets: any[], pMarkets: any[]) {
    try {
        console.log(`Starting Matching... K: ${kMarkets.length}, P: ${pMarkets.length}`);
    
        // Load overrides if exist
        let overrides: Record<string, string> = {}; // ticker -> slug/id
    try {
        const ovPath = path.join(OUT_DIR, 'manual_overrides.json');
        if (fs.existsSync(ovPath)) {
            overrides = JSON.parse(fs.readFileSync(ovPath, 'utf-8'));
        }
    } catch (e) {}

    // Build PM Index
    // Map words -> Set of market indices
    const pmIndex = new Map<string, Set<number>>();
    pMarkets.forEach((m, idx) => {
        const q = m.question || '';
        const norm = normalize(q);
        const words = norm.split(' ').filter(w => w.length > 0);
        words.forEach(w => {
            if (!pmIndex.has(w)) pmIndex.set(w, new Set());
            pmIndex.get(w)!.add(idx);
        });
    });

    const candidates: any[] = [];
    const insertedPairs: any[] = [];
    let updatedCount = 0;

    for (const k of kMarkets) {
        const kTitle = k.title;
        const kSubtitle = k.subtitle || '';
        // Only use title to avoid noise from subtitle (which contains options like "Yes ... No ...")
        const kNorm = normalize(kTitle); 
        const kWords = kNorm.split(' ').filter(w => w.length > 0);

        if (kWords.length === 0) continue;

        // Find potential matches
        const potentialPmIndices = new Map<number, number>(); // idx -> hits
        kWords.forEach(w => {
            if (pmIndex.has(w)) {
                pmIndex.get(w)!.forEach(idx => {
                    potentialPmIndices.set(idx, (potentialPmIndices.get(idx) || 0) + 1);
                });
            }
        });

        // Score candidates
        let bestMatch: { pm: any, score: number, shared: string[] } | null = null;
        
        for (const [pIdx, hits] of potentialPmIndices.entries()) {
            const p = pMarkets[pIdx];
            const pNorm = normalize(p.question);
            const pWords = pNorm.split(' ').filter(w => w.length > 0);
            
            const kSet = new Set(kWords);
            const pSet = new Set(pWords);
            const intersection = new Set([...kSet].filter(x => pSet.has(x)));
            const union = new Set([...kSet, ...pSet]);
            
            // Jaccard
            let jaccard = intersection.size / union.size;

            // Boost logic
            const highValueKeywords = ['fed', 'interest', 'rate', 'cpi', 'inflation', 'gdp', 'senate', 'house', 'president', 'bitcoin', 'ethereum', 'trump', 'biden', 'harris', 'election'];
            let bonus = 0;
            let hasHighValue = false;
            
            for (const kw of highValueKeywords) {
                if (kSet.has(kw) && pSet.has(kw)) {
                    bonus += 0.15;
                    hasHighValue = true;
                }
            }

            // Penalties for length mismatch (prevent matching "Fed Rate" with "Fed Rate March 2025")
            // if (Math.abs(kWords.length - pWords.length) > 3) {
            //     bonus -= 0.1;
            // }

            let finalScore = jaccard + bonus;

            // Validation: Must share at least 2 words OR (1 word AND it's high value)
            // Relaxed validation: Just 2 words overlap is enough if we have stop words filtered
            const isValid = intersection.size >= 2 || (intersection.size >= 1 && hasHighValue);

            if (updatedCount < 10) {
                 console.log(`Debug Match: K="${kNorm}" P="${pNorm}" | Shared: ${Array.from(intersection)} | Score: ${finalScore.toFixed(3)} | Valid: ${isValid}`);
             }

             if (isValid && finalScore > (bestMatch?.score || 0)) {
                bestMatch = { pm: p, score: finalScore, shared: Array.from(intersection) };
            }
        }

        // Lower threshold to 0.25
        if (bestMatch && bestMatch.score >= 0.25) {
            candidates.push({
                k_ticker: k.ticker,
                k_title: kTitle + ' ' + kSubtitle,
                pm_question: bestMatch.pm.question,
                score: bestMatch.score,
                shared_words: bestMatch.shared,
                pm_slug: bestMatch.pm.slug,
                pm_id: bestMatch.pm.id
            });
            
            // Insert into DB
             await insertPair(k, bestMatch.pm);
             updatedCount++;
         }
     }

    fs.writeFileSync(path.join(OUT_DIR, 'pair_candidates.json'), JSON.stringify(candidates, null, 2));
    
    const report = {
        total_kalshi: kMarkets.length,
        total_pm: pMarkets.length,
        candidates_found: candidates.length,
        inserted_or_updated: updatedCount,
        new_pair_ids: insertedPairs.map(p => p.id).slice(0, 10)
    };
    
    fs.writeFileSync(path.join(OUT_DIR, 'pair_seed_report.json'), JSON.stringify(report, null, 2));
    console.log('Report saved.', report);
    
    // Helper to insert
    async function insertPair(k: any, pm: any) {
         // Extract PM details
         // PM market from Gamma has 'outcomes' (JSON string or array) and 'clobTokenIds'
         let outcomes: string[] = [];
         let tokens: string[] = [];
         try {
             outcomes = typeof pm.outcomes === 'string' ? JSON.parse(pm.outcomes) : pm.outcomes;
             tokens = typeof pm.clobTokenIds === 'string' ? JSON.parse(pm.clobTokenIds) : pm.clobTokenIds;
         } catch (e) {}
         
         if (!outcomes.length || !tokens.length) return;
         
         const yesIdx = outcomes.findIndex(o => o.toLowerCase() === 'yes');
         const noIdx = outcomes.findIndex(o => o.toLowerCase() === 'no');
         if (yesIdx === -1) return; // Not binary YES/NO?

         const yesToken = tokens[yesIdx];
         const noToken = tokens[noIdx] || ''; // Might not exist?

         const pairData = {
            title_pm: pm.question,
            title_kh: k.title,
            pm_market_slug: pm.slug || pm.url?.split('/').pop() || '',
            pm_market_id: pm.id,
            pm_yes_token_id: yesToken,
            pm_no_token_id: noToken,
            pm_open_url: `https://polymarket.com/event/${pm.eventSlug || ''}?tid=${yesToken}`,
            
            kh_ticker: k.ticker,
            kh_yes_contract_id: null, // Kalshi doesn't give specific contract IDs easily here, usually ticker + side
            kh_no_contract_id: null,
            kh_open_url: `https://kalshi.com/markets/${k.ticker}`,
            
            resolve_time_pm: new Date(pm.endDate || new Date()),
            resolve_time_kh: new Date(k.expiration_time || new Date()),
            rules_pm: pm.description || '',
            rules_kh: k.rules_primary || '',
            
            is_binary: true,
            status: PairStatus.verified
         };

         // Upsert
         const existing = await prisma.pair.findFirst({
             where: { kh_ticker: k.ticker }
         });

         if (existing) {
             // Update?
             // await prisma.pair.update(...)
         } else {
             const newPair = await prisma.pair.create({
                 data: pairData
             });
             insertedPairs.push(newPair);
        }
    } // End insertPair
    
    } catch (e) {
        console.error('Match error:', e);
        fs.writeFileSync(path.join(OUT_DIR, 'error.log'), String(e));
    }
}

async function main() {
    console.log('Script started. OUT_DIR:', OUT_DIR);

    // Dynamic imports
    console.log('Loading modules...');
    const dbModule = await import('../lib/db');
    prisma = dbModule.prisma;
    const khModule = await import('../lib/adapters/kalshi');
    khRequest = khModule.khRequest;
    const pmModule = await import('../lib/adapters/polymarket');
    pmRequest = pmModule.pmRequest;
    const clientModule = await import('@prisma/client');
    PairStatus = clientModule.PairStatus;
    console.log('Modules loaded.');

    try {
        let kMarkets;
        if (fs.existsSync(path.join(OUT_DIR, 'kalshi_markets.json'))) {
            console.log('Loading cached Kalshi markets...');
            kMarkets = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'kalshi_markets.json'), 'utf-8'));
            // Re-filter to ensure quality
            console.log(`Before re-filter: ${kMarkets.length}`);
            kMarkets = kMarkets.filter((m: any) => 
                (!m.custom_strike || Object.keys(m.custom_strike).length === 0) && 
                !m.ticker.startsWith('KXMV') && 
                !m.ticker.startsWith('KXNBA')
            );
            console.log(`After re-filter: ${kMarkets.length}`);
        } else {
            kMarkets = await fetchKalshiMarkets();
        }

        let pMarkets;
        if (fs.existsSync(path.join(OUT_DIR, 'pm_markets.json'))) {
            console.log('Loading cached Polymarket markets...');
            pMarkets = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'pm_markets.json'), 'utf-8'));
        } else {
            pMarkets = await fetchPolymarketMarkets();
        }

        await matchAndSeed(kMarkets, pMarkets);
    } catch (e) {
        console.error('Main execution error:', e);
        fs.writeFileSync(path.join(OUT_DIR, 'fatal_error.log'), String(e));
        process.exit(1);
    }
}

main().catch(console.error);
