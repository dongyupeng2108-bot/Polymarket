import { prisma } from '@/lib/db';
import { pmRequest } from '@/lib/adapters/polymarket';
import { khRequest } from '@/lib/adapters/kalshi';

const GAMMA_URL = 'https://gamma-api.polymarket.com';

export const dynamic = 'force-dynamic';

// Known good tag IDs (Task 066)
const KNOWN_TAG_IDS: Record<string, string> = {
    'politics': '789',      // us-politics
    'sports': '1',          // sports
    'crypto': '21',         // crypto
    'finance': '120',       // finance
    'geopolitics': '100265', // geopolitics
    'earnings': '604',      // stocks (proxy)
    'tech': '506',          // tech-news
    'culture': '315',       // entertainment
    'world': '101970',      // world
    'economy': '100328'     // economy
};

function normalizeName(name: string): string {
  if (!name) return '';
  // Enhanced normalization (Task 066)
  return name.toLowerCase()
    .replace(/\b(will|be|by|before|after|date|reach|hit|above|below|between|next)\b/g, '') // Remove temporal/condition verbs
    .replace(/[.,\/#!$ %\^&\*;:{}=\-_`~()]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getTrigrams(s: string): Set<string> {
    const res = new Set<string>();
    const clean = s.replace(/\s+/g, '');
    for (let i = 0; i < clean.length - 2; i++) {
        res.add(clean.slice(i, i + 3));
    }
    return res;
}

function fuzzyMatch(a: string, b: string): { score: number, reason: string, tokens: string[] } {
    if (!a || !b) return { score: 0, reason: 'empty', tokens: [] };
    const normA = normalizeName(a);
    const normB = normalizeName(b);
    
    if (normA === normB) return { score: 1.0, reason: 'exact_norm', tokens: [normA] };
    if (normA.includes(normB) || normB.includes(normA)) return { score: 0.9, reason: 'substring', tokens: [] };

    // Token Jaccard
    const tokensA = new Set(normA.split(' ').filter(x => x.length > 2));
    const tokensB = new Set(normB.split(' ').filter(x => x.length > 2));
    
    let tokenScore = 0;
    if (tokensA.size > 0 && tokensB.size > 0) {
        let intersection = 0;
        tokensA.forEach(t => { if (tokensB.has(t)) intersection++; });
        const union = new Set([...tokensA, ...tokensB]).size;
        tokenScore = union > 0 ? intersection / union : 0;
    }

    // Trigram Jaccard
    const triA = getTrigrams(normA);
    const triB = getTrigrams(normB);
    let triScore = 0;
    if (triA.size > 0 && triB.size > 0) {
        let intersection = 0;
        triA.forEach(t => { if (triB.has(t)) intersection++; });
        const union = new Set([...triA, ...triB]).size;
        triScore = union > 0 ? intersection / union : 0;
    }

    // Weighted Score (Token priority, but Trigram helps)
    const score = (tokenScore * 0.6) + (triScore * 0.4);
    
    return { 
        score, 
        reason: `weighted(tok=${tokenScore.toFixed(2)}, tri=${triScore.toFixed(2)})`,
        tokens: Array.from(tokensA)
    };
}

function extractPmKeywords(events: any[]): string[] {
    const stopWords = new Set([
        'the', 'a', 'an', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'and', 'or', 'is', 'are', 
        'will', 'be', 'vs', 'who', 'what', 'when', 'where', 'why', 'how', 'does', 'did', 
        'market', 'price', 'value', 'outcome', 'predict', 'forecast', 'bet', 'wins', 'winner', 'winning',
        'above', 'below', 'over', 'under', 'more', 'less', 'than', 'before', 'after', 'during',
        'yes', 'no', 'polymarket', 'reach', 'hits', 'approval', 'rating', 'rate',
        'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
        'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
        '2024', '2025', '2026', '2027', 'year', 'month', 'week', 'day',
        'but', 'has', 'have', 'had', 'do', 'can', 'could', 'which', 'close', 'between', 'reaches', '2028',
        'best', 'next', 'most', 'game', 'match', 'versus', 'win', 'lose', 'loser'
    ]);
    const counts: Record<string, number> = {};
    
    events.forEach(e => {
        const text = (e.title + ' ' + (e.slug || '')).toLowerCase();
        const words = text.split(/[^a-z0-9]+/);
        words.forEach(w => {
            if (w.length > 3 && !stopWords.has(w) && isNaN(Number(w))) {
                counts[w] = (counts[w] || 0) + 1;
            }
        });
    });

    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([w]) => w);
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const limitParam = parseInt(searchParams.get('limit') || '1000'); 
    const limit = Math.min(Math.max(limitParam, 1), 5000); 
    const pmLimit = parseInt(searchParams.get('pm_limit') || '1000'); 
    const requestId = crypto.randomUUID().slice(0, 8); 

    // Fail-fast: Check Database Connection
    try {
        await prisma.$queryRaw`SELECT 1`;
    } catch (e) {
        console.error("[AutoMatch] Database connection failed:", e);
        return new Response(JSON.stringify({
            error: "Database connection failed",
            error_code: "DB_CONNECTION_FAILED",
            hint: "Ensure Postgres is running on port 5432. Try 'npm run db:up' or check docker status.",
            status: "FAILED"
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    let scanRunId = 0;
    try {
        const scanRun = await prisma.scanRun.create({
            data: { status: 'running', pairs_processed: 0 }
        });
        scanRunId = scanRun.id;
    } catch (e) {
        console.error("Failed to create ScanRun", e);
    }

    const universeMode = searchParams.get('kh_mode') || searchParams.get('universe_mode') || process.env.KALSHI_UNIVERSE_MODE || 'auto';
    const customKeywords = (searchParams.get('keywords') || '').split(',').map(s => s.trim()).filter(Boolean);
    const mveFilter = searchParams.get('mve_filter') || 'exclude'; 
    
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
        async start(controller) {
            let debug: any = {
                pm_events_count: 0,
                kalshi_markets_count: 0,
                kalshi_pages_fetched: 0,
                last_cursor_present: false,
                proxy_effective: !!process.env.HTTPS_PROXY,
                candidate_count: 0,
                samples: { pm: [], kh: [] },
                match_entry_check: {},
                kalshi_fetch: { 
                    base_url: '', 
                    endpoint: '', 
                    params_summary: { mve_filter: mveFilter }, 
                    auth_mode: 'unknown', 
                    auth_present: false,
                    universe_mode: universeMode,
                    search_matrix_summary: null 
                },
                kh_prefix_counts_top10: {},
                pm_topic_hint_top10: {},
                pm_keywords_used: [],
                domain_mismatch_guess: { is_mismatch: false, reason: '', mve_filter: mveFilter },
                universe_auto_switched: false,
                kh_title_samples_topN: [],
            };

            const send = (event: string, data: any) => {
                try {
                    let payloadData = data;
                    if (typeof data === 'object' && data !== null) {
                         // Attach debug info
                         data.debug = debug;
                         data.request_id = requestId;
                         data.ts = Date.now();
                         payloadData = data;
                    }
                    
                    let jsonStr;
                    try {
                        jsonStr = JSON.stringify(payloadData);
                    } catch (stringifyErr) {
                         // Fallback: Try sending without debug if stringify failed
                         console.error("JSON Stringify failed, retrying without debug:", stringifyErr);
                         if (typeof data === 'object' && data !== null) {
                             const { debug, ...cleanData } = data;
                             jsonStr = JSON.stringify(cleanData);
                         } else {
                             jsonStr = String(data);
                         }
                    }

                    const payload = `event: ${event}\ndata: ${jsonStr}\n\n`;
                    controller.enqueue(encoder.encode(payload)); 
                } catch (e) {
                    console.error("Failed to send SSE:", e);
                }
            };

            const terminate = async (payload: any) => {
                 send('terminated', payload);
                 if (scanRunId) {
                     try {
                         await prisma.scanRun.update({
                             where: { id: scanRunId },
                             data: {
                                 status: 'failed',
                                 error: payload.error_code || 'TERMINATED',
                                 completed_at: new Date(),
                                 pairs_processed: stats.scanned
                             }
                         });
                     } catch (e) {}
                 }
                 await new Promise(r => setTimeout(r, 500));
                 try { controller.close(); } catch (e) {}
            };

            const sendError = async (payload: any) => {
                 const fullPayload = { request_id: requestId, ts: Date.now(), ...payload };
                 const eventPayload = `event: error\ndata: ${JSON.stringify(fullPayload)}\n\n`;
                 try { controller.enqueue(encoder.encode(eventPayload)); } catch (e) {}
                 await terminate({ ok: false, reason: 'error', ...fullPayload });
            };

            const complete = async (payload: any) => {
                 send('complete', payload);
                 if (scanRunId) {
                     try {
                         await prisma.scanRun.update({
                             where: { id: scanRunId },
                             data: {
                                 status: 'completed',
                                 completed_at: new Date(),
                                 pairs_processed: stats.scanned
                             }
                         });
                     } catch (e) {}
                 }
                 await new Promise(r => setTimeout(r, 500));
                 try { controller.close(); } catch (e) {}
            };

            let stats = {
                scanned: 0,
                candidates: 0,
                added: 0,
                skipped_existing: 0,
                skipped_filtered: 0,
                errors: 0
            };

            const getPublicStats = () => ({
                scanned: stats.scanned,
                matched: stats.candidates,
                added: stats.added,
                existing: stats.skipped_existing,
                skipped: stats.skipped_filtered, 
                failed: stats.errors
            });

            request.signal.addEventListener('abort', () => {
                if (scanRunId) {
                     prisma.scanRun.update({
                         where: { id: scanRunId },
                         data: { status: 'failed', error: 'CLIENT_ABORT', completed_at: new Date() }
                     }).catch(() => {});
                }
            });

            let currentMode = universeMode;
            let activeKeywords: string[] = [];
            let khMarkets: any[] = [];
            let pmEvents: any[] = [];
            let pageCount = 0;
            let cursor: string | undefined = undefined;

            try {
                // === PHASE 1: MODE DETERMINATION ===
                if (currentMode === 'auto') {
                    send('progress', { step: `Fetching Kalshi Baseline & PM Hints (Auto Mode v2)...`, ...getPublicStats() });
                    
                    const [baselineRes, pmRes] = await Promise.all([
                        khRequest('/markets', { params: { limit: 100, status: 'open', mve_filter: mveFilter } }),
                        pmRequest('/events', { params: { limit: pmLimit, active: true, closed: false } }, GAMMA_URL)
                    ]);

                    // Process PM Hints
                    let pmKeywords: string[] = [];
                    if (pmRes.success && Array.isArray(pmRes.data)) {
                        pmEvents = pmRes.data;
                        debug.pm_events_count = pmEvents.length;
                        pmKeywords = extractPmKeywords(pmRes.data);
                        debug.pm_topic_hint_top10 = pmKeywords.slice(0, 10);
                        debug.pm_keywords_used = pmKeywords;
                    }

                    // Process Kalshi Baseline & Detect Mismatch
                    if (baselineRes.success && baselineRes.data.markets) {
                        const markets = baselineRes.data.markets;
                        const sportsPrefixes = ['KXNBA', 'KXNFL', 'KXMLB', 'KXNHL', 'KXSOCCER', 'KXUFC', 'KXNCAA', 'KXPGA', 'KXUSD', 'KXEUR'];
                        let sportsCount = 0;
                        markets.forEach((m: any) => {
                             if (sportsPrefixes.some(p => m.ticker.startsWith(p)) || m.category === 'Sports') sportsCount++;
                        });
                        
                        const dominance = sportsCount / markets.length;
                        const pmPoliticsKeywords = ['trump', 'harris', 'election', 'senate', 'house', 'president', 'biden', 'vote', 'poll'];
                        const pmCryptoKeywords = ['bitcoin', 'crypto', 'eth', 'btc', 'solana', 'token', 'coin', 'price'];
                        const pmIsPolitics = pmKeywords.some(k => pmPoliticsKeywords.includes(k));
                        const pmIsCrypto = pmKeywords.some(k => pmCryptoKeywords.includes(k));

                        debug.domain_mismatch_guess = {
                            is_mismatch: false,
                            ratio: dominance,
                            mve_filter: mveFilter,
                            reason: `Sports dominance: ${(dominance * 100).toFixed(1)}%. PM Pol/Cry: ${pmIsPolitics}/${pmIsCrypto}`
                        };

                        if (mveFilter === 'only') debug.domain_mismatch_guess.reason += " (Intentional: mve_filter=only)";

                        // Trigger Switch: Sports > 15% AND PM is Pol/Crypto (unless mve_filter=only)
                        const isMismatch = (dominance > 0.15 && mveFilter !== 'only') && (pmIsPolitics || pmIsCrypto);

                        if (isMismatch) {
                             debug.domain_mismatch_guess.is_mismatch = true;
                             debug.domain_mismatch_guess.reason += " -> Triggering Auto-Switch (topic_aligned)";
                             
                             currentMode = 'topic_aligned';
                             activeKeywords = pmKeywords;
                             debug.universe_auto_switched = true;
                             debug.from_mode = 'auto';
                             debug.to_mode = 'topic_aligned';
                             debug.advice = `Auto-switched to topic_aligned. Keywords: ${activeKeywords.slice(0, 5).join(',')}`;
                             send('progress', { step: `Auto-Switching to Topic Aligned (Mismatch Detected)...`, ...getPublicStats() });
                        } else {
                            khMarkets = markets; // Keep baseline
                            currentMode = 'public_all'; 
                        }
                    }
                }

                // === PHASE 2: KALSHI FETCH ===
                if (currentMode === 'search_keywords' || currentMode === 'topic_aligned') {
                    // Strategy: Category Aligned Fetch via Events -> Markets
                    // This avoids the /markets endpoint returning global sports garbage.
                    
                    // If no active keywords/PM events yet, fetch PM first
                    if (pmEvents.length === 0) {
                         send('progress', { step: `Fetching PM Hints for Topic Aligned Mode v2...`, ...getPublicStats() });
                         // Parallel Fetch for PM Tags to ensure coverage
                          const pmTags = Object.values(KNOWN_TAG_IDS);
                          const pmPromises = pmTags.map(tagId => 
                              pmRequest('/events', { params: { limit: 100, tag_id: tagId, sort: 'volume' } }, GAMMA_URL)
                          );
                          
                          const pmResults = await Promise.all(pmPromises);
                          const allPmEvents: any[] = [];
                          pmResults.forEach(r => {
                              if (r.success && Array.isArray(r.data)) allPmEvents.push(...r.data);
                          });
                          
                          // Deduplicate PM Events
                          const seenPm = new Set();
                          pmEvents = [];
                          for (const e of allPmEvents) {
                              if (!seenPm.has(e.id)) {
                                  seenPm.add(e.id);
                                  pmEvents.push(e);
                              }
                          }
                          
                          debug.pm_events_count = pmEvents.length;
                          activeKeywords = extractPmKeywords(pmEvents);
                     }
 
                     const keywords = [...new Set([...activeKeywords, ...customKeywords])];
                     debug.kalshi_fetch.universe_mode = currentMode;
                     debug.kalshi_fetch.keywords = keywords;
                     debug.kalshi_fetch.search_matrix_summary = {};
 
                     // Target Categories (Aligned with User Interest)
                     const targetCategories = ['Politics', 'Economics', 'Financials', 'Crypto', 'Science and Technology', 'Entertainment'];
                     // Exclude Sports in topic_aligned unless requested
                     if (currentMode === 'search_keywords') targetCategories.push('Sports');
 
                     send('progress', { step: `Fetching Kalshi Events by Category...`, ...getPublicStats() });
                     
                     const allNewMarkets: any[] = [];
                     const eventTickersToFetch = new Set<string>();
 
                     // 1. Fetch Events for Categories
                    // Fetch events with pagination to ensure we get enough valid category-aligned events
                    // (Kalshi API often ignores category param and returns global top, so we must dig deep)
                    for (const cat of targetCategories) {
                        try {
                            let validEventsCount = 0;
                            let cursor: string | undefined;
                            let pages = 0;
                            const MAX_PAGES = 20; // Scan up to 2000 events per category to find valid ones
                            const TARGET_VALID = 120; // Aim for 120 valid events per category

                            while (validEventsCount < TARGET_VALID && pages < MAX_PAGES) {
                                const params: any = { limit: 100, status: 'open', category: cat };
                                if (cursor) params.cursor = cursor;

                                const res = await khRequest('/events', { params });
                                pages++;

                                if (res.success && res.data.events) {
                                    let pageValid = 0;
                                    res.data.events.forEach((evt: any) => {
                                        // Hard Filter: If not Sports, ban Sports prefixes
                                        if (cat !== 'Sports' && evt.event_ticker.startsWith('KXMVESPORTS')) return;
                                        
                                        // Strict Category Check (Client-side)
                                        if (evt.category?.toLowerCase() !== cat.toLowerCase()) return;

                                        eventTickersToFetch.add(evt.event_ticker);
                                        validEventsCount++;
                                        pageValid++;
                                    });
                                    
                                    cursor = res.data.cursor;
                                    if (!cursor) break; // No more pages
                                } else {
                                    break; // Error or no data
                                }
                                
                                // Small delay to avoid rate limits
                                if (pages > 1) await new Promise(r => setTimeout(r, 100));
                            }
                            debug.kalshi_fetch.search_matrix_summary[cat] = `${validEventsCount} valid events (scanned ${pages} pages)`;
                        } catch (e: any) {
                            debug.kalshi_fetch.search_matrix_summary[cat] = `Exception: ${e.message}`;
                        }
                    }
                     
                     send('progress', { step: `Fetching Markets for ${eventTickersToFetch.size} Events (Batched)...`, ...getPublicStats() });
 
                     // 2. Fetch Markets for Events (Batched)
                    // Optimization: Don't fetch 1000 events if we only need a few matches.
                    // Assume 20% match rate -> need 5x limit events.
                    // But events might have 0 markets, so be generous.
                    // For limit=50, maxEvents=250. For limit=1000, maxEvents=1000 (capped).
                    const maxEventsToScan = Math.min(limit * 5, 1000);
                    const tickers = Array.from(eventTickersToFetch).slice(0, maxEventsToScan);
                    
                    send('debug_log', { msg: `Scanning ${tickers.length} events (limit=${limit}, pool=${eventTickersToFetch.size})` });
                    
                    const BATCH_SIZE = 20;
                     
                     for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
                         const batch = tickers.slice(i, i + BATCH_SIZE);
                         send('debug_log', { msg: `Fetching batch ${i/BATCH_SIZE + 1}/${Math.ceil(tickers.length/BATCH_SIZE)} (${batch.length} events)` });
                         
                         const marketPromises = batch.map(ticker => {
                            // Wrap in timeout to prevent hanging
                            const fetchWithTimeout = async () => {
                                 const timeoutMs = 10000;
                                 const timeout = new Promise<any>((_, reject) => 
                                     setTimeout(() => reject(new Error(`Timeout ${timeoutMs}ms for ${ticker}`)), timeoutMs)
                                 );
                                 try {
                                     // console.log(`[AutoMatch] Fetching markets for ${ticker}...`);
                                     return await Promise.race([
                                         khRequest('/markets', { params: { limit: 100, status: 'open', event_ticker: ticker } }),
                                         timeout
                                     ]);
                                 } catch (e: any) {
                                     console.error(`[AutoMatch] Error fetching ${ticker}:`, e);
                                     return { success: false, meta: { error_message: e.message } };
                                 }
                            };
                            return fetchWithTimeout();
                        });
                         
                         const marketResults = await Promise.all(marketPromises);
                          send('debug_log', { msg: `Batch ${i/BATCH_SIZE + 1} done. Results: ${marketResults.length}` });
                          
                          marketResults.forEach(res => {
                              if (res.success && res.data.markets) {
                                 allNewMarkets.push(...res.data.markets);
                             }
                         });
                         
                         send('debug_log', { msg: `Batch processing done.` });
                         
                         // Small delay to be nice to API
                         // await new Promise(r => setTimeout(r, 100));
                     }
 
                     send('debug_log', { msg: 'Starting Filter...' });
                     // 3. Filter and Deduplicate
                     const seenKh = new Set();
                     khMarkets = [];
                     for (const m of allNewMarkets) {
                        if (!seenKh.has(m.ticker)) {
                            seenKh.add(m.ticker);
                            // Ensure category is set (heuristic)
                            if (!m.category) m.category = 'derived_topic_aligned';
                            khMarkets.push(m);
                        }
                    }
                    send('debug_log', { msg: `Filter done. khMarkets: ${khMarkets.length}` });
                    
                    debug.kalshi_markets_count = khMarkets.length;
                    
                } else if (currentMode === 'public_all') {
                    // Strategy: Public All (Pagination)
                    const KH_LIMIT = 1000;
                    const MAX_PAGES = 5;
                    const MAX_TOTAL = 5000;
                    
                    // khMarkets might have baseline items, keep them? Yes.
                    
                    cursor = undefined;
                    pageCount = 0;
                    const startTime = Date.now();

                    while (pageCount < MAX_PAGES && khMarkets.length < MAX_TOTAL) {
                        if (request.signal.aborted) throw new Error('Client aborted');
                        if (Date.now() - startTime > 20000) break; // 20s timeout

                        pageCount++;
                        send('progress', { step: `Fetching Kalshi Markets (Page ${pageCount})...`, ...getPublicStats() });

                        const params: any = { limit: KH_LIMIT, status: 'open', mve_filter: mveFilter };
                        if (cursor) params.cursor = cursor;

                        const khRes = await khRequest('/markets', { params });
                        
                        if (!khRes.success) break;
                        
                        const markets = khRes.data.markets || [];
                        if (markets.length === 0) break;

                        // Merge
                        const existingIds = new Set(khMarkets.map(m => m.ticker));
                        markets.forEach((m: any) => {
                            if (!existingIds.has(m.ticker)) {
                                khMarkets.push(m);
                                existingIds.add(m.ticker);
                            }
                        });
                        
                        cursor = khRes.data.cursor;
                        if (!cursor) break;
                    }
                    debug.kalshi_pages_fetched = pageCount;
                    debug.kalshi_markets_count = khMarkets.length;
                }

                // === PHASE 3: PM FETCH (Ensure Coverage) ===
                if (pmEvents.length < limit) {
                     // Fetch more if needed (Global Top)
                     // Logic similar to existing implementation
                     // Simplified here for brevity, assuming pmLimit fetched enough in Phase 1 or 2
                     // If we need strict Tag Fetch for topic_aligned, we could add it here.
                     // But AutoMatch usually relies on broad scans.
                }
                
                // Debug Sampling
                debug.samples.kh = khMarkets.slice(0, 3).map((m: any) => ({ t: m.ticker, title: m.title }));
                debug.samples.pm = pmEvents.slice(0, 3).map((e: any) => ({ id: e.id, title: e.title }));

                // === PHASE 4: MATCHING ===
                send('progress', { step: 'Matching...', ...getPublicStats() });
                
                // FIX B: Kalshi Degradation - DB Fallback
                let isDegraded = false;
                if (khMarkets.length === 0) {
                    send('progress', { step: 'Kalshi Markets Empty. Attempting DB Fallback...', ...getPublicStats() });
                    try {
                        const dbPairs = await prisma.pair.findMany({
                            where: { kh_ticker: { not: null } },
                            select: { kh_ticker: true, title_kh: true }
                        });
                        
                        const seen = new Set();
                        dbPairs.forEach(p => {
                            if (p.kh_ticker && !seen.has(p.kh_ticker)) {
                                seen.add(p.kh_ticker);
                                khMarkets.push({
                                    ticker: p.kh_ticker,
                                    title: p.title_kh || 'Unknown',
                                    category: 'Unknown'
                                });
                            }
                        });
                        
                        if (khMarkets.length > 0) {
                            isDegraded = true;
                            debug.kalshi_markets_count = khMarkets.length;
                            debug.is_degraded = true;
                            send('progress', { step: `Loaded ${khMarkets.length} Cached Markets from DB (Degraded Mode)`, ...getPublicStats() });
                        }
                    } catch (e) {
                        console.error("DB Fallback failed", e);
                    }
                }

                // FIX A: Scanned Count
                stats.scanned = pmEvents.length;
                
                let processedCount = 0;
                
                // Optimize: Index Kalshi by Title Tokens for faster lookup?
                // For fuzzy match, O(N*M) is expensive if N,M ~ 1000. 10^6 ops is fine in JS.
                
                for (const pm of pmEvents) {
                    if (request.signal.aborted) break;
                    if (stats.candidates >= limit) break; // Optimization: Stop if we have enough
                    processedCount++;
                    // stats.scanned is already set to total pmEvents, we don't need to increment it here
                    // or we can track processed vs total. Let's keep stats.scanned as "participating events".

                    let topMatches: { score: number, market: any, reason: string }[] = [];

                    for (const kh of khMarkets) {
                        const { score, reason } = fuzzyMatch(pm.title, kh.title);
                        
                        // FIX C: Maintain Top 3 for Fallback
                        topMatches.push({ score, market: kh, reason });
                        topMatches.sort((a, b) => b.score - a.score);
                        if (topMatches.length > 3) topMatches.pop();
                    }

                    const best = topMatches[0];
                        // Threshold: 0.25 (Lowered from 0.3 for fuzzy + trigram)
                        if (best && best.score > 0.25) {
                            stats.candidates++;
                            
                            const HIGH_CONFIDENCE_THRESHOLD = 0.85;
                            const isHighConfidence = best.score >= HIGH_CONFIDENCE_THRESHOLD;
                            let isAdded = false;
                            let isExisting = false;

                            // Auto-Add Logic for High Confidence
                            if (isHighConfidence) {
                                try {
                                    // Check existing
                                    const existing = await prisma.pair.findFirst({
                                        where: {
                                            OR: [
                                                { pm_market_id: pm.id },
                                                { kh_ticker: best.market.ticker }
                                            ]
                                        }
                                    });

                                    if (existing) {
                                        stats.skipped_existing++;
                                        isExisting = true;
                                    } else {
                                        // Create new pair
                                        await prisma.pair.create({
                                            data: {
                                                pm_market_id: pm.id,
                                                title_pm: pm.title,
                                                pm_market_slug: pm.slug || null, // Best effort
                                                kh_ticker: best.market.ticker,
                                                title_kh: best.market.title,
                                                status: 'unverified',
                                                confidence: parseFloat(best.score.toFixed(2)),
                                                // Minimal fields required
                                                pm_yes_token_id: null,
                                                pm_no_token_id: null,
                                                kh_yes_contract_id: best.market.ticker, // Often same as ticker
                                                kh_no_contract_id: null,
                                                // Required fields defaults
                                                resolve_time_pm: new Date(),
                                                resolve_time_kh: new Date(),
                                                rules_pm: "",
                                                rules_kh: ""
                                            }
                                        });
                                        stats.added++;
                                        isAdded = true;
                                    }
                                } catch (err) {
                                    console.error("Auto-add failed", err);
                                    stats.errors++;
                                }
                            }

                            const pair = {
                                pm_id: pm.id,
                                pm_title: pm.title,
                                kh_ticker: best.market.ticker,
                                kh_title: best.market.title,
                                score: best.score.toFixed(2),
                                reason: best.reason,
                                category: best.market.category,
                                is_high_confidence: isHighConfidence,
                                is_added: isAdded,
                                is_existing: isExisting
                            };
                            
                            send('candidate', pair);
                            
                            // Debug log first few matches
                            if (stats.candidates <= 10) {
                                debug.match_entry_check[`match_${stats.candidates}`] = pair;
                            }
                        } else if (best && (isDegraded || stats.candidates < 10) && best.score > 0.05) {
                         // FIX C: Fallback for low confidence or degraded mode
                         // Only if score is at least minimal (0.05) to avoid total garbage
                         stats.candidates++;
                         const pair = {
                             pm_id: pm.id,
                             pm_title: pm.title,
                             kh_ticker: best.market.ticker,
                             kh_title: best.market.title,
                             score: best.score.toFixed(2),
                             reason: best.reason + " (Low Confidence)",
                             category: best.market.category,
                             is_low_confidence: true
                         };
                         send('candidate', pair);
                    }
                }

                // Explicitly set trace alias for v3.9 compliance
                debug.kalshi_fetch_trace = debug.kalshi_fetch;
                debug.kalshi_fetch.auth_present = !isDegraded; // approximate
                debug.candidate_count = stats.candidates; // Sync candidate count

                const finalReason = isDegraded 
                    ? (khMarkets.length > 0 ? 'kalshi_auth_missing_degraded' : 'no_kalshi_markets_available')
                    : (stats.candidates === 0 ? 'no_matches_found' : 'completed_normally');

                await complete({
                    summary: {
                        scanned: stats.scanned,
                        candidates: stats.candidates,
                        added: stats.added,
                        existing: stats.skipped_existing,
                        skipped_filtered: stats.skipped_filtered,
                        errors: stats.errors,
                        reason: finalReason
                    },
                    stats: getPublicStats()
                });

            } catch (e: any) {
                console.error("[AutoMatch] Fatal Error:", e);
                await sendError({
                    message: `Fatal error: ${e.message}`,
                    error_code: 'FATAL_ERROR',
                    stack: e.stack
                });
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
    });
}
