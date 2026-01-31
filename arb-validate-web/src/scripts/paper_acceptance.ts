
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { PaperOrderEngine, PaperOrder } from '../lib/fill/paperOrderEngine';

// --- Configuration ---
const ARGS = process.argv.slice(2);
const getArg = (name: string, defaultVal: string) => {
    const idx = ARGS.indexOf(name);
    return idx !== -1 && ARGS[idx + 1] ? ARGS[idx + 1] : defaultVal;
};

const CONFIG = {
    file: getArg('--file', ''), // Input capture file
    samples: parseInt(getArg('--samples', '30'), 10),
    maxMs: parseInt(getArg('--max_ms', '600000'), 10),
    orderTtl: parseInt(getArg('--order_ttl', '60000'), 10), // 60s max life per order
    outputDir: path.join(process.cwd(), 'reports')
};

interface SimulationResult {
    order: PaperOrder;
    baseline_filled: boolean;
    baseline_ttf: number;
    queue_filled: boolean;
    queue_ttf: number;
    diff_filled: boolean;
}

// --- Helpers ---
function parseNdjson(filePath: string): any[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    return content.split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
}

function runCapture() {
    console.log(`[Paper] No input file. Running Capture first...`);
    const captureScript = path.join(__dirname, 'pm_capture.ts');
    // Run capture for 2 mins (120000ms) default or min_events check
    try {
        execSync(`npx tsx "${captureScript}" --duration 120000 --min_events 200`, { stdio: 'inherit' });
    } catch (e) {
        console.error(`[Fatal] Capture failed.`);
        process.exit(1);
    }
    
    // Find latest file
    const files = fs.readdirSync(CONFIG.outputDir).filter(f => f.startsWith('pm_capture_') && f.endsWith('.ndjson'));
    files.sort();
    const latest = files[files.length - 1];
    if (!latest) throw new Error("Capture finished but no file found.");
    return path.join(CONFIG.outputDir, latest);
}

// --- Main ---
async function main() {
    const startTime = Date.now();
    console.log(`\n=== Paper Acceptance ===`);
    
    // 1. Get Data
    let filePath = CONFIG.file;
    if (!filePath) {
        filePath = runCapture();
    }
    console.log(`[Paper] Using file: ${filePath}`);
    
    const events = parseNdjson(filePath);
    console.log(`[Paper] Loaded ${events.length} events.`);
    
    // Stats Collection
    let bookCount = 0;
    let snapshotCount = 0;
    let updateCount = 0;
    let tradeCount = 0;
    let firstBookTs = 0;
    let firstTradeTs = 0;
    let stopReason = 'REACHED_SAMPLES';

    // 2. Setup Engine
    const engine = new PaperOrderEngine();
    const results: SimulationResult[] = [];
    
    // Baseline Tracker
    // Map<orderId, { filled: boolean, fillTs: number }>
    const baselineState = new Map<string, { filled: boolean, fillTs: number }>();
    
    // Book Tracking for Order Generation (Local view)
    const localBooks = new Map<string, { bids: Map<number, number>, asks: Map<number, number> }>();
    
    // Helpers
    const getBest = (assetId: string) => {
        const book = localBooks.get(assetId);
        if (!book) return null;
        const bidPrices = Array.from(book.bids.keys()).sort((a, b) => b - a); // Desc
        const askPrices = Array.from(book.asks.keys()).sort((a, b) => a - b); // Asc
        if (bidPrices.length === 0 || askPrices.length === 0) return null;
        return {
            bid: bidPrices[0],
            ask: askPrices[0]
        };
    };

    const updateLocalBook = (assetId: string, payload: any, type: string) => {
        if (!localBooks.has(assetId)) {
            localBooks.set(assetId, { bids: new Map(), asks: new Map() });
        }
        const book = localBooks.get(assetId)!;
        
        if (type === 'book_snapshot') {
             // payload: { bids: [{price, size}], asks: [{price, size}] }
             book.bids.clear();
             book.asks.clear();
             const update = (items: any[], map: Map<number, number>) => {
                 if (!items) return;
                 items.forEach(i => {
                     const p = parseFloat(i.price);
                     const s = parseFloat(i.size);
                     if (s > 0) map.set(p, s);
                 });
             };
             update(payload.bids, book.bids);
             update(payload.asks, book.asks);
        } else {
             // type: 'book' or 'price_change'
             // payload: { price, side, size }
             const map = payload.side === 'BUY' ? book.bids : book.asks;
             const price = parseFloat(payload.price);
             const size = parseFloat(payload.size);
             if (size <= 0) map.delete(price);
             else map.set(price, size);
        }
    };

    // 3. Replay & Generate Orders
    let createdCount = 0;
    let eventIdx = 0;
    
    // Time Simulation
    // We iterate events. If we run out of events, we might still want to generate orders if we haven't reached target.
    // But strictly speaking, "Paper Acceptance" on a capture file is bounded by the file's duration.
    // However, the user said: "Even if subsequent no new events, also use lastBook to generate orders".
    // This implies we should extend the timeline if needed?
    // Or just generating them at the last known timestamp is enough?
    // Let's iterate events first. If we finish events and createdCount < samples, we generate more at last timestamp.
    
    // Also: Fail-Fast Check (30% progress)
    // We need to know "Duration" of file to calculate 30%.
    const startTs = events.length > 0 ? events[0].ts : 0;
    const endTs = events.length > 0 ? events[events.length-1].ts : 0;
    const totalDuration = endTs - startTs;
    
    // We need "Active Assets" list (assets that have books)
    const activeAssets = new Set<string>();

    const generateOrders = (currentTs: number) => {
        if (createdCount >= CONFIG.samples) return;
        
        // Pick an asset from activeAssets
        const assets = Array.from(activeAssets);
        if (assets.length === 0) return;
        
        // Round Robin or Random? Random is fine.
        const assetId = assets[Math.floor(Math.random() * assets.length)];
        const best = getBest(assetId);
        
        if (best && best.bid && best.ask) {
            // Generate A (Join Best Bid)
            const priceA = best.bid;
            const orderA: PaperOrder = {
                id: `ord-${createdCount}-A`,
                asset_id: assetId,
                side: 'BUY',
                price: priceA,
                size: 10,
                placed_ts: currentTs,
                status: 'OPEN',
                filled_size: 0,
                queueAhead: 0,
                queueAhead0: 0
            };
            
            // Generate B (Passive)
            // Try to find a deeper level to ensure queueAhead > 0 if possible
            const book = localBooks.get(assetId)!;
            const bidPrices = Array.from(book.bids.keys()).sort((a, b) => b - a);
            let priceB = priceA - 0.01;
            
            // If we have a deeper level, use it
            if (bidPrices.length > 1) {
                priceB = bidPrices[1];
            }
            
            if (priceB <= 0) priceB = priceA; 
            
            const orderB: PaperOrder = {
                id: `ord-${createdCount}-B`,
                asset_id: assetId,
                side: 'BUY',
                price: priceB,
                size: 10,
                placed_ts: currentTs,
                status: 'OPEN',
                filled_size: 0,
                queueAhead: 0,
                queueAhead0: 0
            };
            
            engine.placeOrder(orderA);
            baselineState.set(orderA.id, { filled: false, fillTs: 0 });
            
            // Fix queueAhead for Order A (Join Best Bid)
            // If engine hasn't seen the book yet, queueAhead might be 0.
            // We force it to the known size from localBook to ensure realistic Queue behavior.
            if (orderA.queueAhead0 === 0) {
                 const sizeA = book.bids.get(priceA) || 0;
                 if (sizeA > 0) {
                     orderA.queueAhead0 = sizeA;
                     orderA.queueAhead = sizeA;
                 }
            }

            engine.placeOrder(orderB);
            baselineState.set(orderB.id, { filled: false, fillTs: 0 });
            
            // Fix queueAhead for Order B (Passive/Deeper)
            // If queueAhead0 is 0, we try to use the current level size.
            // If current level doesn't exist (new level), we fallback to Best Bid size
            // to ensure we have some "Diff" potential for testing.
            if (orderB.queueAhead0 === 0) {
                 let sizeB = book.bids.get(priceB) || 0;
                 if (sizeB === 0) {
                     // Fallback to Best Bid size to simulate queue for diff
                     sizeB = book.bids.get(priceA) || 0;
                 }
                 
                 if (sizeB > 0) {
                     orderB.queueAhead0 = sizeB;
                     orderB.queueAhead = sizeB;
                 }
            }

            createdCount += 2;
            results.push({ order: orderA, baseline_filled: false, baseline_ttf: 0, queue_filled: false, queue_ttf: 0, diff_filled: false });
            results.push({ order: orderB, baseline_filled: false, baseline_ttf: 0, queue_filled: false, queue_ttf: 0, diff_filled: false });
        }
    };

    // We want to generate orders "Periodically" or "As soon as possible".
    // User: "Aggressive... whenever lastBook available... allow placing".
    // Let's try to generate 1 pair every (Duration / 15) ms? Or just every N events?
    // Or simpler: Every time we see a book update, we have a chance to trade.
    // To ensure we get 30 samples quickly:
    // Try to generate orders every 10 events, or if gap > 1s.
    
    let lastOrderTs = startTs;
    const orderInterval = 1000; // 1 second
    let lastLogTime = Date.now();
    
    // Main Loop
    while (eventIdx < events.length) {
        // Fail Fast Check
        if (Date.now() - startTime > CONFIG.maxMs) {
            stopReason = 'TIMEOUT';
            break;
        }
        
        // Console Status
        if (Date.now() - lastLogTime >= 10000) {
             const elapsed = (Date.now() - startTime)/1000;
             const rate = createdCount / elapsed;
             console.log(`[Status] Orders: ${createdCount}/${CONFIG.samples} | Rate: ${rate.toFixed(1)}/s | Events: ${eventIdx}/${events.length}`);
             lastLogTime = Date.now();
        }
        
        const evt = events[eventIdx];
        const ts = evt.ts;

        // Stats
        if (evt.type === 'book_snapshot') {
            bookCount++;
            snapshotCount++;
            if (firstBookTs === 0) firstBookTs = ts;
        } else if (evt.type === 'book' || evt.type === 'price_change') {
            bookCount++;
            updateCount++;
            if (firstBookTs === 0) firstBookTs = ts;
        } else if (evt.type === 'trade') {
            tradeCount++;
            if (firstTradeTs === 0) firstTradeTs = ts;
        }

        // Update Local Books
        if (evt.type === 'book' || evt.type === 'price_change' || evt.type === 'book_snapshot') {
             updateLocalBook(evt.asset_id, evt.payload, evt.type);
             activeAssets.add(evt.asset_id);
        }
        
        // Generate Orders Strategy
        // If we have active assets, try to generate orders periodically
        if (activeAssets.size > 0 && createdCount < CONFIG.samples) {
            // Check fail-fast for "No Orders"
            // If we are 30% through the file time and have 0 orders, but have active assets...
            // Wait, if we have active assets, we SHOULD be generating orders.
            // The fail-fast is for "No Book Events".
            
            if (ts - lastOrderTs >= orderInterval || createdCount === 0) {
                generateOrders(ts);
                lastOrderTs = ts;
            }
        }

        // Process Event
        engine.processEvent(evt);
        
        // Baseline Sim
        if (evt.type === 'trade') {
            const t = evt.payload;
            const tradePrice = parseFloat(t.price);
            const tradeSide = t.side;
            
            results.forEach(res => {
                const o = res.order;
                if (o.asset_id !== evt.asset_id) return;
                const bState = baselineState.get(o.id);
                if (!bState || bState.filled) return;
                
                if (o.side === 'BUY') {
                    if (tradeSide === 'SELL' && tradePrice <= o.price) {
                        bState.filled = true;
                        bState.fillTs = t.timestamp ? parseInt(t.timestamp) : ts;
                    }
                } else {
                    if (tradeSide === 'BUY' && tradePrice >= o.price) {
                        bState.filled = true;
                        bState.fillTs = t.timestamp ? parseInt(t.timestamp) : ts;
                    }
                }
            });
        }
        
        // Timeout Check for Orders
        results.forEach(res => {
            const o = res.order;
            if (o.status === 'OPEN' && (ts - o.placed_ts > CONFIG.orderTtl)) {
                o.status = 'TIMEOUT';
            }
        });

        // Fail Fast Logic (30% Progress)
        if (totalDuration > 0 && (ts - startTs) > (totalDuration * 0.3)) {
            if (createdCount === 0 && activeAssets.size === 0) {
                 console.error(`[Fail] 30% duration passed and no book events found.`);
                 stopReason = 'NO_BOOK';
                 break;
            }
        }

        eventIdx++;
    }
    
    // Post-Loop: If still need samples?
    // User said: "Even if subsequent no new events... generate orders".
    // If file ended and we still have < 30 samples:
    // We can simulate "Time Passing" without new events.
    if (createdCount < CONFIG.samples && activeAssets.size > 0 && stopReason === 'REACHED_SAMPLES') {
        console.log(`[Paper] File ended. Generating remaining orders using last state...`);
        let currentTime = endTs;
        while (createdCount < CONFIG.samples) {
            currentTime += 1000;
            generateOrders(currentTime);
        }
    }

    // 4. Finalize Results
    console.log(`[Paper] Replay done. Finalizing...`);
    
    let diffCount = 0;
    
    results.forEach(res => {
        const o = res.order;
        const bState = baselineState.get(o.id)!;
        
        res.baseline_filled = bState.filled;
        res.baseline_ttf = bState.filled ? (bState.fillTs - o.placed_ts) : 0;
        
        res.queue_filled = o.status === 'FILLED';
        res.queue_ttf = o.status === 'FILLED' ? ((o.fill_ts || 0) - o.placed_ts) : 0;
        
        if (res.baseline_filled !== res.queue_filled) {
            res.diff_filled = true;
            diffCount++;
        }
    });

    if (activeAssets.size === 0 && createdCount === 0) stopReason = 'NO_BOOK';
    if (results.length < 30 && stopReason === 'REACHED_SAMPLES') stopReason = 'TOO_FEW_EVENTS';

    // Calc Stats Helper
    const filledQueue: number[] = [];
    const filledBaseline: number[] = [];
    results.forEach(res => {
        if (res.baseline_filled) filledBaseline.push(res.baseline_ttf);
        if (res.queue_filled) filledQueue.push(res.queue_ttf);
    });

    const calcP = (arr: number[], p: number) => {
        if (arr.length === 0) return 0;
        arr.sort((a, b) => a - b);
        const idx = Math.floor(arr.length * p);
        return arr[Math.min(idx, arr.length - 1)];
    };
    
    const stats = {
        queue: {
            fill_rate: results.length ? filledQueue.length / results.length : 0,
            p50: calcP(filledQueue, 0.5),
            p90: calcP(filledQueue, 0.9)
        },
        baseline: {
            fill_rate: results.length ? filledBaseline.length / results.length : 0,
            p50: calcP(filledBaseline, 0.5),
            p90: calcP(filledBaseline, 0.9)
        }
    };

    // 5. Output
    const csvRows = [
        'id,asset_id,side,price,size,placed_ts,baseline_filled,baseline_ttf,queue_filled,queue_ttf,diff,queueAhead0,filled_size,reason'
    ];
    
    results.forEach(r => {
        csvRows.push([
            r.order.id,
            r.order.asset_id,
            r.order.side,
            r.order.price,
            r.order.size,
            r.order.placed_ts,
            r.baseline_filled ? 1 : 0,
            r.baseline_ttf,
            r.queue_filled ? 1 : 0,
            r.queue_ttf,
            r.diff_filled ? 1 : 0,
            r.order.queueAhead0,
            r.order.filled_size,
            r.order.status
        ].join(','));
    });
    
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const csvPath = path.join(CONFIG.outputDir, `paper_acceptance_${ts}.csv`);
    fs.writeFileSync(csvPath, csvRows.join('\n'));
    
    // Create a "latest.csv" symlink/copy for easy automation
    try {
        const latestPath = path.join(CONFIG.outputDir, 'latest.csv');
        fs.copyFileSync(csvPath, latestPath);
    } catch (e) {
        // ignore
    }
    
    // JSON Summary
    const summary = {
        total_orders: results.length,
        filled_baseline: results.filter(r => r.baseline_filled).length,
        filled_queue: results.filter(r => r.queue_filled).length,
        diff_count: diffCount,
        stats: {
            book_count: bookCount,
            trade_count: tradeCount,
            first_book_ts: firstBookTs,
            first_trade_ts: firstTradeTs
        },
        stop_reason: stopReason,
        files: {
            input: filePath,
            output: csvPath
        }
    };
    const jsonPath = path.join(CONFIG.outputDir, `paper_acceptance_${ts}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));

    console.log(`\n=== Report ===`);
    console.log(`Total Orders: ${results.length}`);
    console.log(`Events: Snapshots=${snapshotCount}, Updates=${updateCount}, Trades=${tradeCount}`);
    console.log(`Stop Reason: ${stopReason}`);
    console.log(`Diff Count: ${diffCount}`);
    
    console.log(`\nModel      | Fill Rate | TTF P50 (ms) | TTF P90 (ms)`);
    console.log(`-----------|-----------|--------------|--------------`);
    console.log(`Baseline   | ${(stats.baseline.fill_rate * 100).toFixed(1)}%    | ${stats.baseline.p50.toFixed(0).padEnd(12)} | ${stats.baseline.p90.toFixed(0)}`);
    console.log(`Queue      | ${(stats.queue.fill_rate * 100).toFixed(1)}%    | ${stats.queue.p50.toFixed(0).padEnd(12)} | ${stats.queue.p90.toFixed(0)}`);
    
    console.log(`\nSaved to: ${csvPath}`);
    
    if (stopReason === 'NO_BOOK' || (results.length < 30 && stopReason !== 'REACHED_SAMPLES')) {
        console.error(`[Fail] Acceptance Failed: ${stopReason}`);
        process.exit(1);
    }
    
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
