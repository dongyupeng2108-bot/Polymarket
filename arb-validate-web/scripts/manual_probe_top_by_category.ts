import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { ProxySelector } from '../src/lib/services/proxy-selector';
import { getAgent } from '../src/lib/utils/proxy-agent';
import { createHash } from 'crypto';

// --- Configuration ---
const TASK_ID = 'M2_5_AutoMatch_Fix_Candidates0_By_TopicAlignedUniverse_And_FuzzyMatch_260128_066';
const PM_GAMMA_URL = 'https://gamma-api.polymarket.com';
const KALSHI_API_URL = 'https://api.elections.kalshi.com/trade-api/v2';
const OUTPUT_DIR = path.resolve(__dirname, '../reports');
const PORT_HC = 53121;

const CATEGORIES = [
    'Politics', 'Sports', 'Crypto', 'Finance', 'Geopolitics',
    'Earnings', 'Tech', 'Culture', 'World', 'Economy'
];

// Known good tag IDs (Task 066) - Synced with route.ts
const KNOWN_TAG_IDS: Record<string, string> = {
    'Politics': '789',      // us-politics
    'Sports': '1',          // sports
    'Crypto': '21',         // crypto
    'Finance': '120',       // finance
    'Geopolitics': '100265', // geopolitics
    'Earnings': '604',      // stocks (proxy)
    'Tech': '506',          // tech-news
    'Culture': '315',       // entertainment
    'World': '101970',      // world
    'Economy': '100328'     // economy
};

// Kalshi Category Map
const KALSHI_CATEGORY_MAP: Record<string, string> = {
    'Politics': 'Politics',
    'Sports': 'Sports',
    'Crypto': 'Economics', // Crypto often under Economics/Financials
    'Finance': 'Financials',
    'Geopolitics': 'World', // Mapping to World or Politics
    'Earnings': 'Financials',
    'Tech': 'Science and Technology',
    'Culture': 'Entertainment', // or Culture if exists
    'World': 'World',
    'Economy': 'Economics'
};

// Global Tag Map
let PM_TAG_MAP: Record<string, string> = {}; // slug -> id

// --- Helpers ---

async function fetchWithProxy(url: string, params: any = {}): Promise<any> {
    const selector = ProxySelector.getInstance();
    const best = selector.selectBestProfile(new Set());
    const profile = best.profile;
    
    const agent = getAgent(profile, url);
    const instance = axios.create({
        ...agent,
        timeout: 15000,
        validateStatus: () => true
    });

    let attempts = 0;
    while (attempts < 3) {
        try {
            attempts++;
            const res = await instance.get(url, { params });
            if (res.status === 200) {
                return res.data;
            }
            console.warn(`[Proxy] GET ${url} Status: ${res.status}`);
            if (res.status === 429) {
                await new Promise(r => setTimeout(r, 2000));
                continue;
            }
        } catch (e: any) {
            console.error(`[Proxy] GET ${url} Error:`, e.message);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    return null;
}

async function checkHealth() {
    try {
        const r1 = await axios.get(`http://127.0.0.1:${PORT_HC}/`, { timeout: 2000, validateStatus: () => true });
        const r2 = await axios.get(`http://127.0.0.1:${PORT_HC}/pairs`, { timeout: 2000, validateStatus: () => true });
        return {
            root_status: r1.status,
            pairs_status: r2.status,
            ok: r1.status === 200 && r2.status === 200,
            text: `/ -> ${r1.status}\n/pairs -> ${r2.status}`
        };
    } catch (e: any) {
        return { ok: false, text: `Healthcheck Failed: ${e.message}` };
    }
}

function getSha256(content: string) {
    return createHash('sha256').update(content).digest('hex').substring(0, 8);
}

// --- Main Logic ---

interface MarketItem {
    rank?: number;
    title: string;
    id: string;
    slug?: string;
    volume: number;
    url: string;
    source: 'PM' | 'KALSHI';
    category: string;
    tags?: any[];
    fetch_info?: string;
}

async function initPMTags() {
    console.log('Initializing PM Tags...');
    // Pre-populate with known IDs
    Object.entries(KNOWN_TAG_IDS).forEach(([cat, id]) => {
        // Map category name to ID directly, or use a slug if we want
        // For this script, we look up by Category Name -> ID
        console.log(`Loaded known tag: ${cat} -> ${id}`);
    });
}

async function getPMMarketsForCategory(category: string): Promise<MarketItem[]> {
    let items: any[] = [];
    let method = '';
    let fetchParams = '';

    const tagId = KNOWN_TAG_IDS[category];
    
    if (tagId) {
        console.log(`Fetching PM Category [${category}] via tag_id=${tagId}`);
        fetchParams = `tag_id=${tagId}`;
        const data = await fetchWithProxy(`${PM_GAMMA_URL}/events`, {
            tag_id: tagId,
            limit: 20,
            sort: 'volume'
        });
        if (Array.isArray(data) && data.length > 0) {
            items = data;
            method = 'tag_id';
        } else {
            console.warn(`[${category}] Fetch via tag_id=${tagId} returned ${Array.isArray(data) ? 'empty array' : 'invalid data/null'}`);
        }
    } else {
        console.warn(`[${category}] No known tag_id found. MARKING FAILED.`);
        method = 'FAILED_NO_TAG';
        fetchParams = `tag_id=MISSING`;
        items = [];
    }

    const seen = new Set<string>();
    const result: MarketItem[] = [];

    for (const m of items) {
        const id = m.id || m.slug;
        if (seen.has(id)) continue;

        const vol = Number(m.volume || 0);
        
        seen.add(id);
        result.push({
            title: m.title,
            id: id,
            slug: m.slug,
            volume: vol,
            url: `https://polymarket.com/event/${m.slug}`,
            source: 'PM',
            category,
            tags: m.tags,
            fetch_info: `method=${method}; params=[${fetchParams}]`
        });
    }

    return result.sort((a, b) => b.volume - a.volume);
}

// Global Cache
let GLOBAL_KALSHI_MARKETS: any[] = [];
let GLOBAL_MARKETS_BY_EVENT: Record<string, any[]> = {};
let KALSHI_DATA_LOADED = false;

async function prefetchKalshiMarkets() {
    if (KALSHI_DATA_LOADED) return;
    
    console.log("Pre-fetching Top 2000 Kalshi Markets...");
    let allMarkets: any[] = [];
    let cursor: string | undefined = undefined;
    
    // Fetch up to 2000 markets
    while (allMarkets.length < 2000) {
        try {
            const params: any = { limit: 1000, status: 'open' };
            if (cursor) params.cursor = cursor;
            
            const data = await fetchWithProxy(`${KALSHI_API_URL}/markets`, params);
            if (!data?.markets || data.markets.length === 0) break;
            
            allMarkets = allMarkets.concat(data.markets);
            cursor = data.cursor;
            if (!cursor) break;
        } catch (e) {
            console.error("Error prefetching markets:", e);
            break;
        }
    }
    
    console.log(`Prefetched ${allMarkets.length} markets.`);
    GLOBAL_KALSHI_MARKETS = allMarkets;
    
    // Index by event_ticker
    for (const m of allMarkets) {
        if (m.event_ticker) {
            if (!GLOBAL_MARKETS_BY_EVENT[m.event_ticker]) {
                GLOBAL_MARKETS_BY_EVENT[m.event_ticker] = [];
            }
            GLOBAL_MARKETS_BY_EVENT[m.event_ticker].push(m);
        }
    }
    KALSHI_DATA_LOADED = true;
}

async function getKalshiByCategory(category: string): Promise<MarketItem[]> {
    // Strategy: Use /events to get relevant tickers, then fetch markets.
    
    let kCat = KALSHI_CATEGORY_MAP[category];
    if (!kCat) return [];
    
    // Global Cache for efficiency
    if (!KALSHI_DATA_LOADED) {
        await prefetchKalshiMarkets();
    }
    
    let items: any[] = [];
    let fetchLog: string[] = [];
    
    let targetCats = [kCat];
    
    // Additional Category Mappings for Kalshi Specifics
    if (category === 'Tech') targetCats = ['Science and Technology', 'Companies'];
    else if (category === 'Geopolitics') targetCats = ['Politics', 'World']; 
    else if (category === 'Earnings') targetCats = ['Economics', 'Financials']; 
    else if (category === 'World') targetCats = ['Politics', 'World'];
    else if (category === 'Economy') targetCats = ['Economics', 'Financials'];
    else if (category === 'Crypto') targetCats = ['Economics']; // Crypto is often here

    for (const tCat of targetCats) {
        fetchLog.push(`events?cat='${tCat}'`);
        let events: any[] = [];
        try {
            // Fetch events for the category
            const data = await fetchWithProxy(`${KALSHI_API_URL}/events`, {
                limit: 100, 
                category: tCat, 
                status: 'open'
            });
            if (data?.events) {
                // Client-side filtering to prevent API from returning global top events if param is ignored
                events = data.events.filter((e: any) => e.category === tCat);
                if (events.length === 0 && data.events.length > 0) {
                    console.warn(`[Kalshi] Category param '${tCat}' might be ignored by API. Filtered ${data.events.length} -> 0 events.`);
                }
            }
        } catch (e) { }

        // Match markets to events
        const topEvents = events.slice(0, 50); // Increased from 20 to 50
        
        for (const evt of topEvents) {
            // Hard Filter: If not Sports, ban Sports prefixes
            if (category !== 'Sports' && evt.event_ticker.startsWith('KXMVESPORTS')) continue;

            // Try cache first
            let mks = GLOBAL_MARKETS_BY_EVENT[evt.event_ticker];
            
            // If not in cache, fetch directly (fallback)
            if (!mks || mks.length === 0) {
                try {
                     const mData = await fetchWithProxy(`${KALSHI_API_URL}/markets`, {
                        event_ticker: evt.event_ticker
                    });
                    if (mData?.markets) {
                        mks = mData.markets;
                    }
                } catch (e) { }
            }

            if (mks) {
                mks.forEach((m: any) => {
                    m._enriched_category = tCat;
                    m._enriched_event_title = evt.title;
                    m.category = tCat; // Fix undefined category
                });
                items = items.concat(mks);
            }
        }
    }

    const seen = new Set();
    const uniqueItems: any[] = [];
    for (const i of items) {
        if (!seen.has(i.ticker)) {
            seen.add(i.ticker);
            uniqueItems.push(i);
        }
    }

    return uniqueItems.map((s: any) => ({
        title: s.title,
        id: s.ticker,
        slug: s.ticker,
        volume: s.volume || 0,
        url: `https://kalshi.com/markets/${s.ticker}`,
        source: 'KALSHI',
        category: s.category || category,
        tags: s.tags,
        fetch_info: `via_events=[${fetchLog.join(', ')}]; event_cat=${s._enriched_category}`
    })).sort((a, b) => b.volume - a.volume);
}

// --- Run ---

(async () => {
    console.log('--- Starting M2.5 Probe ---');
    
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // 1. Init
    await initPMTags();

    const results: Record<string, { pm: MarketItem[], kalshi: MarketItem[] }> = {};
    const logHead: string[] = ['--- LOG_HEAD ---'];

    // 2. Loop Categories
    for (const cat of CATEGORIES) {
        process.stdout.write(`Processing ${cat}... `);
        
        // PM
        const pmItems = await getPMMarketsForCategory(cat);
        
        // Kalshi
        const kalshiItems = await getKalshiByCategory(cat);
        
        console.log(`PM=${pmItems.length}, Kalshi=${kalshiItems.length}`);

        results[cat] = {
            pm: pmItems,
            kalshi: kalshiItems
        };
        
        logHead.push(`Category [${cat}]: PM=${pmItems.length}, Kalshi=${kalshiItems.length}`);
    }

    // 3. Generate Reports
    const csvRows: string[] = ['Category,Rank,Source,Title,ID,Volume,URL'];
    const pmJson: any = {};
    const kalshiJson: any = {};
    const compareJson: any[] = [];
    const bodyTables: string[] = [];

    for (const cat of CATEGORIES) {
        const pmTop10 = results[cat].pm.slice(0, 10);
        const kTop10 = results[cat].kalshi.slice(0, 10);

        pmJson[cat] = results[cat].pm.slice(0, 100);
        kalshiJson[cat] = results[cat].kalshi.slice(0, 100);

        pmTop10.forEach((m, i) => csvRows.push(`${cat},${i+1},PM,"${m.title.replace(/"/g, '""')}",${m.id},${m.volume},${m.url}`));
        kTop10.forEach((m, i) => csvRows.push(`${cat},${i+1},Kalshi,"${m.title.replace(/"/g, '""')}",${m.id},${m.volume},${m.url}`));

        compareJson.push({ category: cat, pm_top10: pmTop10, kalshi_top10: kTop10 });

        let table = `### ${cat}\n`;
        table += `| Rank | PM (Vol) | Kalshi (Vol) |\n|---|---|---|\n`;
        for (let i = 0; i < 10; i++) {
            const p = pmTop10[i];
            const k = kTop10[i];
            const pStr = p ? `[${p.title.substring(0, 30)}${p.title.length>30?'..':''}](${(p.volume/1000).toFixed(1)}k)` : 'EMPTY';
            const kStr = k ? `[${k.title.substring(0, 30)}${k.title.length>30?'..':''}](${(k.volume/1000).toFixed(1)}k)` : 'EMPTY';
            table += `| ${i+1} | ${pStr} | ${kStr} |\n`;
        }
        bodyTables.push(table);
    }

    // Write Files
    const pathPmJson = path.join(OUTPUT_DIR, 'top_by_category_pm.json');
    const pathKalshiJson = path.join(OUTPUT_DIR, 'top_by_category_kalshi.json');
    const pathCompare = path.join(OUTPUT_DIR, 'top_by_category_compare.csv');
    
    fs.writeFileSync(pathPmJson, JSON.stringify(pmJson, null, 2));
    fs.writeFileSync(pathKalshiJson, JSON.stringify(kalshiJson, null, 2));
    fs.writeFileSync(pathCompare, csvRows.join('\n'));

    // 4. Healthcheck
    const hc = await checkHealth();
    
    // 5. Index
    const index = [
        { name: 'top_by_category_pm.json', size: fs.statSync(pathPmJson).size, hash: getSha256(fs.readFileSync(pathPmJson, 'utf-8')) },
        { name: 'top_by_category_kalshi.json', size: fs.statSync(pathKalshiJson).size, hash: getSha256(fs.readFileSync(pathKalshiJson, 'utf-8')) },
        { name: 'top_by_category_compare.csv', size: fs.statSync(pathCompare).size, hash: getSha256(fs.readFileSync(pathCompare, 'utf-8')) }
    ];

    fs.writeFileSync(path.join(OUTPUT_DIR, `deliverables_index_${TASK_ID}.json`), JSON.stringify(index, null, 2));

    // 6. Notify / Result
    const totalPM = Object.values(results).reduce((acc, r) => acc + r.pm.length, 0);
    const totalKalshi = Object.values(results).reduce((acc, r) => acc + r.kalshi.length, 0);

    const resultJson = {
        status: 'DONE',
        task_id: TASK_ID,
        summary: `Fetched top markets for 10 categories. PM Total: ${totalPM}, Kalshi Total: ${totalKalshi}. Files generated.`,
        healthcheck: hc.text
    };

    const notifyContent = [
        '--- RESULT_JSON ---',
        JSON.stringify(resultJson, null, 2),
        '',
        logHead.join('\n'),
        '',
        '--- LOG_TAIL ---',
        'Healthcheck:',
        hc.text,
        '',
        'Top 10 Tables Preview:',
        bodyTables.join('\n'),
        '',
        '--- INDEX ---',
        index.map(i => `${i.name} size=${i.size} sha256=${i.hash}`).join('\n')
    ].join('\n');

    fs.writeFileSync(path.join(OUTPUT_DIR, `notify_${TASK_ID}.txt`), notifyContent);
    console.log(notifyContent);

})();
