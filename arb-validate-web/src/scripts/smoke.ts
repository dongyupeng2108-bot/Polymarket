
import { setupGlobalProxy, getFetchDispatcher } from '../lib/global-proxy';

// Initialize Global Proxy
setupGlobalProxy();

// Configuration
const BASE_URL = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || process.env.APP_BASE_URL || 'http://localhost:53121';
const TIMEOUT_MS = 30000;

console.log(`\n=== Smoke Test: Arb Validate Web ===`);
console.log(`Base URL: ${BASE_URL}`);

async function runStep(name: string, fn: () => Promise<any>): Promise<boolean> {
    process.stdout.write(`[TEST] ${name} ... `);
    const start = Date.now();
    try {
        const result = await Promise.race([
            fn(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS))
        ]);
        const duration = Date.now() - start;
        console.log(`OK (${duration}ms)`);
        return true;
    } catch (e: any) {
        const duration = Date.now() - start;
        console.log(`FAIL (${duration}ms) - ${e.message}`);
        if (e.cause) console.log('      Cause:', e.cause);
        return false;
    }
}

async function fetchJson(path: string, options: any = {}) {
    const url = `${BASE_URL}${path}`;
    const dispatcher = getFetchDispatcher(url);
    const res = await fetch(url, {
        ...options,
        dispatcher: dispatcher
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
    }
    return res.json();
}

async function main() {
    let success = true;
    let eventTicker = 'KXFEDCHAIRNOM'; // Default

    // 1. Check Event Tickers
    success = await runStep('GET /api/event-tickers', async () => {
        const data: any = await fetchJson('/api/event-tickers');
        if (Array.isArray(data) && data.length > 0) {
            // Prefer one that looks like a base ticker
            eventTicker = data[0]; 
            // Try to find a nice one
            const nice = data.find((t: string) => t.startsWith('KX') && !t.includes('-'));
            if (nice) eventTicker = nice;
        } else if (data && data.tickers && Array.isArray(data.tickers)) {
             if (data.tickers.length > 0) eventTicker = data.tickers[0];
        }
        console.log(`      Selected Ticker: ${eventTicker}`);
    }) && success;

    // 2. Check Scan (JSON Body)
    success = await runStep('POST /api/scan/batch (JSON Body)', async () => {
        const body = {
            mode: 'single',
            eventTicker: eventTicker,
            limit: 5,
            min_edge: 0.01
        };
        const data: any = await fetchJson('/api/scan/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!data.ok && !data.results) throw new Error('Invalid response structure');
        console.log(`      Found: ${data.results?.length || 0} items`);
    }) && success;

    // 3. Check Scan (Query Params)
    success = await runStep('POST /api/scan/batch (Query)', async () => {
        const params = new URLSearchParams({
            mode: 'single',
            eventTicker: eventTicker,
            limit: '5',
            min_edge: '0.01'
        });
        const data: any = await fetchJson(`/api/scan/batch?${params.toString()}`, {
            method: 'POST'
        });
        if (!data.ok && !data.results) throw new Error('Invalid response structure');
        console.log(`      Found: ${data.results?.length || 0} items`);
    }) && success;

    console.log(`\n=== Test Complete: ${success ? 'PASSED' : 'FAILED'} ===`);
    if (!success) {
        console.log('Hint: Ensure "npm run dev" is running on port 53121.');
        process.exit(1);
    }
}

main();
