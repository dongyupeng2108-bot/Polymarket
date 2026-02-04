
import { prisma } from '../lib/db';
import { setupGlobalProxy, getFetchDispatcher } from '../lib/global-proxy';

// Initialize Global Proxy
setupGlobalProxy();

const BASE_URL = 'http://localhost:53121';

async function fetchJson(path: string, options: any = {}) {
    const url = `${BASE_URL}${path}`;
    const dispatcher = getFetchDispatcher(url);
    console.log(`[Fetch] Requesting ${url}...`);
    const res = await fetch(url, {
        ...options,
        dispatcher: dispatcher
    });
    console.log(`[Fetch] Status: ${res.status}`);
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`);
    }
    return res.json();
}

async function main() {
    console.log("Verifying Task 033 Logic...");

    // 1. Find an UNVERIFIED pair
    const unverifiedPair = await prisma.pair.findFirst({
        where: { status: { not: 'verified' } },
        select: { id: true, status: true }
    });

    if (unverifiedPair) {
        console.log(`Testing UNVERIFIED pair: ${unverifiedPair.id} (${unverifiedPair.status})`);
        try {
            const res = await fetchJson(`/api/scan/batch?pairIds=${unverifiedPair.id}`, { method: 'POST' });
            console.log(`API Response:`, JSON.stringify(res));
            
            // Expect verifiedIdsCount to be 0
            if (res.meta && res.meta.verifiedIdsCount === 0) {
                 console.log("SUCCESS: UNVERIFIED pair was filtered out.");
            } else if (res.meta && res.meta.verifiedIdsCount > 0) {
                 console.error("FAILURE: UNVERIFIED pair was NOT filtered out.");
                 throw new Error("UNVERIFIED pair was NOT filtered out");
            } else {
                 console.log("WARNING: Unexpected response structure.");
            }
        } catch (e) {
            console.error("Test 1 Failed with error:", e);
        }
    } else {
        console.log("No UNVERIFIED pair found in DB. Skipping negative test.");
    }

    // 2. Find a VERIFIED pair
    const verifiedPair = await prisma.pair.findFirst({
        where: { status: 'verified' },
        select: { id: true, status: true }
    });

    if (verifiedPair) {
        console.log(`Testing VERIFIED pair: ${verifiedPair.id} (${verifiedPair.status})`);
        try {
            const res = await fetchJson(`/api/scan/batch?pairIds=${verifiedPair.id}`, { method: 'POST' });
             console.log(`API Response:`, JSON.stringify(res));
            
            if (res.meta && res.meta.verifiedIdsCount > 0) {
                 console.log("SUCCESS: VERIFIED pair was processed.");
            } else {
                 console.error("FAILURE: VERIFIED pair was NOT processed.");
                 throw new Error("VERIFIED pair was NOT processed");
            }
        } catch (e) {
             console.error("Test 2 Failed with error:", e);
        }
    } else {
        console.log("No VERIFIED pair found in DB. Skipping positive test.");
    }
    
    console.log("Task 033 Verification Complete.");
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
