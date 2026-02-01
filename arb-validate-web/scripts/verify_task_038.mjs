
import http from 'http';

const URL = 'http://localhost:53121/api/pairs/auto-match/stream?limit=10';
const TIMEOUT_MS = 20000;
const MAX_EVENTS = 30;

console.log(`[Verify] Starting verification against ${URL}`);
console.log(`[Verify] Timeout: ${TIMEOUT_MS}ms, Max Events: ${MAX_EVENTS}`);

let events = [];
let startTime = Date.now();
let hasProgress = false;
let hasError = false;
let hasTerminated = false;
let terminatedTime = 0;
let ended = false;

const req = http.get(URL, (res) => {
    console.log(`[Verify] Response Status: ${res.statusCode}`);
    
    if (res.statusCode !== 200) {
        console.error(`[Verify] Failed to connect: Status ${res.statusCode}`);
        process.exit(1);
    }

    res.setEncoding('utf8');

    let buffer = '';

    res.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n\n');
        buffer = lines.pop(); // Keep incomplete chunk

        for (const line of lines) {
            if (!line.trim()) continue;
            
            const eventMatch = line.match(/^event: (.+)$/m);
            const dataMatch = line.match(/^data: (.+)$/m);

            if (eventMatch && dataMatch) {
                const eventName = eventMatch[1].trim();
                const dataStr = dataMatch[1].trim();
                let data;
                try {
                    data = JSON.parse(dataStr);
                } catch (e) {
                    console.error(`[Verify] JSON Parse Error: ${e.message}`);
                    continue;
                }

                console.log(`[Verify] Event: ${eventName}`);
                events.push({ event: eventName, data, time: Date.now() });

                if (eventName === 'progress') hasProgress = true;
                if (eventName === 'error') {
                    hasError = true;
                    console.log(`[Verify] Error Payload:`, JSON.stringify(data, null, 2));
                    // Check diagnostics
                    if (data.debug) {
                        console.log(`[Verify] Diagnostics Found:`);
                        console.log(`  - Upstream Preview: ${data.debug.upstream_body_preview ? 'Yes (' + data.debug.upstream_body_preview.length + ' chars)' : 'No'}`);
                        console.log(`  - Request Meta:`, JSON.stringify(data.debug.request_meta));
                        console.log(`  - Env Status:`, JSON.stringify(data.debug.env_status));
                        
                        // Safety Check
                        const debugStr = JSON.stringify(data.debug);
                        if (debugStr.includes(process.env.KALSHI_KEY_ID) && process.env.KALSHI_KEY_ID && process.env.KALSHI_KEY_ID.length > 5) {
                            console.error(`[Verify] FATAL: Diagnostics contains sensitive KEY ID!`);
                            process.exit(1);
                        }
                    } else {
                        console.warn(`[Verify] Warning: No 'debug' field in error payload.`);
                    }
                }
                if (eventName === 'terminated') {
                    hasTerminated = true;
                    terminatedTime = Date.now();
                    console.log(`[Verify] Terminated received. Waiting for stream end...`);
                }

                if (events.length >= MAX_EVENTS) {
                    console.log(`[Verify] Max events reached.`);
                    req.destroy();
                    checkResults();
                }
            }
        }
    });

    res.on('end', () => {
        console.log(`[Verify] Stream ended.`);
        ended = true;
        checkResults();
    });

    res.on('error', (e) => {
        console.error(`[Verify] Stream Error: ${e.message}`);
        process.exit(1);
    });
});

req.on('error', (e) => {
    console.error(`[Verify] Request Error: ${e.message}`);
    process.exit(1);
});

// Timeout
setTimeout(() => {
    if (!ended) {
        console.error(`[Verify] Timeout reached.`);
        req.destroy();
        checkResults();
    }
}, TIMEOUT_MS);

function checkResults() {
    if (ended && events.length === 0) {
        console.error(`[Verify] No events received.`);
        process.exit(1);
    }

    if (!hasProgress) {
        console.error(`[Verify] FAILED: No 'progress' event received.`);
        process.exit(1);
    }

    if (hasError && !hasTerminated) {
        console.error(`[Verify] FAILED: 'error' received but no 'terminated' event.`);
        process.exit(1);
    }

    if (hasTerminated) {
        // Check if stream ended reasonably fast after terminated
        // Since we destroy req manually in this script mostly, we can check if terminated was the last or near last event
        const lastEvent = events[events.length - 1];
        if (lastEvent.event !== 'terminated' && lastEvent.event !== 'complete') { // complete is for success
             // It is allowed to have terminated then maybe closure, but usually terminated is last from server
             console.log(`[Verify] Last event was ${lastEvent.event}.`);
        }
        
        // Check if we got diagnostic data in error
        if (hasError) {
             const errEvent = events.find(e => e.event === 'error');
             if (!errEvent.data.debug) {
                 console.error(`[Verify] FAILED: Error event missing 'debug' field.`);
                 process.exit(1);
             }
        }
    }

    console.log(`[Verify] SUCCESS.`);
    process.exit(0);
}
