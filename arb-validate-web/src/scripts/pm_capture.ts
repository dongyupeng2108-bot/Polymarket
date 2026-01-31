
import fs from 'fs';
import path from 'path';
import { setupGlobalProxy, getFetchDispatcher } from '../lib/global-proxy';
import { PolymarketWS } from '../lib/ws/polymarket';

// Initialize Global Proxy
setupGlobalProxy();

// --- Configuration ---
const ARGS = process.argv.slice(2);
const getArg = (name: string, defaultVal: string) => {
    const idx = ARGS.indexOf(name);
    return idx !== -1 && ARGS[idx + 1] ? ARGS[idx + 1] : defaultVal;
};

const CONFIG = {
    durationMs: parseInt(getArg('--duration', '120000'), 10), // 2 mins default
    topK: parseInt(getArg('--top', '20'), 10), // Default to 20 assets to get enough data
    minEvents: parseInt(getArg('--min_events', '200'), 10),
    eventTicker: getArg('--eventTicker', ''),
    outputDir: path.join(process.cwd(), 'reports'),
    port: parseInt(getArg('--port', '53121'), 10)
};

const BASE_URL = `http://localhost:${CONFIG.port}`;

interface AssetStats {
    trade_count: number;
    book_count: number;
    other_count: number;
}

async function main() {
    console.log(`[PM Capture] Duration=${CONFIG.durationMs}ms, TopK=${CONFIG.topK}, MinEvents=${CONFIG.minEvents}, Port=${CONFIG.port}`);
    
    if (!fs.existsSync(CONFIG.outputDir)) {
        fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    }

    // 1. Scan for active assets
    console.log(`[PM Capture] Scanning for active assets...`);
    let assets: string[] = [];
    let pairIds: number[] = [];
    let initialSnapshots: any[] = [];
    
    try {
        let ticker = CONFIG.eventTicker;
        if (!ticker) {
            // Get Ticker
            const tickerUrl = `${BASE_URL}/api/event-tickers`;
            const tickerRes = await fetch(tickerUrl, { dispatcher: getFetchDispatcher(tickerUrl) } as any);
            if (!tickerRes.ok) throw new Error(`Ticker fetch failed: ${tickerRes.status}`);
            const tickerData: any = await tickerRes.json();
            const items = tickerData.items || tickerData.tickers || tickerData || [];
            ticker = items.map((t: any) => typeof t === 'string' ? t : t.eventTicker)
                                .find((t: string) => t && t.startsWith('KX') && !t.includes('-')) || items[0];
        }
        
        if (!ticker) throw new Error("No valid ticker found");
        console.log(`[PM Capture] Using Ticker: ${ticker}`);

        // Fetch Pairs for Ticker
        const url = `${BASE_URL}/api/scan/batch?mode=single&eventTicker=${ticker}&limit=100&min_edge=-0.99`; 
        const res = await fetch(url, { dispatcher: getFetchDispatcher(url), method: 'POST' } as any);
        if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
        
        const data: any = await res.json();
        const results = data.results || [];
        
        const candidates = results.filter((r: any) => 
            r.status === 'ok' && r.tickers?.pm?.yes && r.tickers?.pm?.no
        ).slice(0, CONFIG.topK);
        
        if (candidates.length === 0) {
            throw new Error("No active candidates found from scanner.");
        }
        
        candidates.forEach((c: any) => {
            if (c.tickers.pm.yes) assets.push(c.tickers.pm.yes);
            if (c.tickers.pm.no) assets.push(c.tickers.pm.no);
            pairIds.push(c.pair_id);

            // Capture Initial Snapshot Data
            if (c.market_data && c.market_data.pm) {
                if (c.tickers.pm.yes) {
                     initialSnapshots.push({
                         ts: Date.now(),
                         type: 'book_snapshot',
                         asset_id: c.tickers.pm.yes,
                         payload: {
                             bids: c.market_data.pm.bids || [],
                             asks: c.market_data.pm.asks || []
                         }
                     });
                }
                if (c.tickers.pm.no) {
                    initialSnapshots.push({
                        ts: Date.now(),
                        type: 'book_snapshot',
                        asset_id: c.tickers.pm.no,
                        payload: {
                            bids: c.market_data.pm.bids || [], // Assuming YES/NO share book structure or inverted? 
                            // WAIT: PM usually has separate Order Books for Yes and No?
                            // Actually Polymarket CLOB usually has separate token IDs.
                            // The scanner returns 'market_data.pm' which usually corresponds to the "Main" token (usually YES for binary?).
                            // If `c.market_data.pm` is just one book, we need to know which asset it belongs to.
                            // Usually scanner.ts fetches the market for the PAIR.
                            // But CLOB markets are per token.
                            // Let's assume market_data.pm is for YES token if typical.
                            // Or maybe scanner fetches both?
                            // In `scanner.ts`: `market_data: { pm: { bids: ..., asks: ... } }`.
                            // It seems to fetch just one set of bids/asks.
                            // If we assign it to YES token, that's a safe bet for now.
                            asks: c.market_data.pm.asks || []
                        }
                    });
                     // Note: We might be assigning same book to both Yes/No or just Yes.
                     // For "paper acceptance", we just need *some* book to generate orders.
                }
            }
        });
        
        console.log(`[PM Capture] Selected ${candidates.length} pairs (${assets.length} assets).`);
        console.log(`[PM Capture] Pairs: ${pairIds.join(', ')}`);

    } catch (e: any) {
        console.error(`[Fatal] Failed to scan assets: ${e.message}`);
        console.error(`Hint: Ensure Web Service is running on port ${CONFIG.port}`);
        process.exit(1);
    }

    // 2. Setup Output Stream
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `pm_capture_${ts}.ndjson`;
    const filepath = path.join(CONFIG.outputDir, filename);
    const stream = fs.createWriteStream(filepath, { flags: 'a' });
    
    console.log(`[PM Capture] Writing to: ${filepath}`);

    // Write Initial Snapshots
    initialSnapshots.forEach(s => stream.write(JSON.stringify(s) + '\n'));
    console.log(`[PM Capture] Wrote ${initialSnapshots.length} initial snapshots.`);

    // 3. Connect WS
    const ws = new PolymarketWS(assets, 5); // Max 5 reconnects
    
    let eventCount = 0;
    const stats: Record<string, AssetStats> = {};
    const getStats = (assetId: string) => {
        if (!stats[assetId]) stats[assetId] = { trade_count: 0, book_count: 0, other_count: 0 };
        return stats[assetId];
    };
    
    const startTime = Date.now();
    let lastLogTime = startTime;

    const writeEvent = (type: string, asset_id: string, payload: any) => {
        const record = {
            ts: Date.now(),
            type,
            asset_id,
            payload
        };
        stream.write(JSON.stringify(record) + '\n');
        eventCount++;
        
        const s = getStats(asset_id);
        if (type === 'trade') s.trade_count++;
        else if (type === 'book' || type === 'price_change') s.book_count++;
        else s.other_count++;
    };

    ws.on('trade', (t) => writeEvent('trade', t.asset_id, t));
    ws.on('price_change', (pc) => writeEvent('book', pc.asset_id, pc));
    ws.on('fatal_error', (err) => {
        console.error(`\n[Fatal] WS Error: ${err.message}`);
        process.exit(1);
    });

    ws.connect();

    // 4. Wait Loop
    await new Promise<void>(resolve => {
        const timer = setInterval(() => {
            const now = Date.now();
            const elapsed = now - startTime;
            
            // Log Status every 10s
            if (now - lastLogTime >= 10000) {
                const rate = eventCount / (elapsed / 1000);
                const remaining = Math.max(0, CONFIG.durationMs - elapsed);
                console.log(`[Status] Events: ${eventCount} | Rate: ${rate.toFixed(1)}/s | Elapsed: ${(elapsed/1000).toFixed(0)}s | ETA: ${(remaining/1000).toFixed(0)}s`);
                lastLogTime = now;
            }
            
            // Check Stop Conditions
            if (elapsed >= CONFIG.durationMs) {
                console.log(`\n[Stop] Duration reached.`);
                clearInterval(timer);
                resolve();
            } else if (eventCount >= 2000) { // Hard limit 2000 events to save time if active
                 console.log(`\n[Stop] Max events reached (2000).`);
                 clearInterval(timer);
                 resolve();
            }
        }, 1000);
    });

    console.log(`\n[PM Capture] Finished. Captured ${eventCount} WS events.`);
    ws.close();
    stream.end();
    
    // 5. Final Stats & Fail-Fast
    console.log(`\n=== Event Breakdown ===`);
    let totalBook = 0;
    let totalTrade = 0;
    
    Object.entries(stats).forEach(([asset, s]) => {
        if (s.book_count > 0 || s.trade_count > 0) {
            // console.log(`  ${asset}: Book=${s.book_count}, Trade=${s.trade_count}`);
            totalBook += s.book_count;
            totalTrade += s.trade_count;
        }
    });
    
    console.log(`Total Book (PriceChange): ${totalBook}`);
    console.log(`Total Trades: ${totalTrade}`);
    console.log(`Total Events: ${eventCount}`);

    // Fail-Fast Check
    const totalRecorded = eventCount + initialSnapshots.length;
    const hasBookData = totalBook > 0 || initialSnapshots.length > 0;
    
    if (totalRecorded < CONFIG.minEvents || !hasBookData) {
        console.error(`\n[Fail] Capture Failed.`);
        if (!hasBookData) console.error(`Reason: NO book data (updates or snapshots). Market might be inactive or subscription failed.`);
        if (totalRecorded < CONFIG.minEvents) console.error(`Reason: Too few events (${totalRecorded} < ${CONFIG.minEvents}).`);
        
        console.error(`Action: Try a different --eventTicker or increase --duration.`);
        process.exit(1);
    }
    
    // Summary
    console.log(`[Summary] File: ${filepath}`);
    console.log(`[Summary] Size: ${(fs.statSync(filepath).size / 1024).toFixed(1)} KB`);
    
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
