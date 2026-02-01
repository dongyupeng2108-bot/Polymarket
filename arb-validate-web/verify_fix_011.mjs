
const BASE_URL = 'http://localhost:53121';

async function main() {
    try {
        // 1. Get Initial Stats
        console.log("1. Fetching Initial Stats...");
        const res1 = await fetch(`${BASE_URL}/api/dashboard/stats`);
        const stats1 = await res1.json();
        const count1 = stats1.scanCountTotal;
        console.log(`Initial Scan Count: ${count1}`);

        // 2. Trigger Scan
        console.log("2. Triggering Batch Scan...");
        const resScan = await fetch(`${BASE_URL}/api/scan/batch?mode=single&eventTicker=KXFEDCHAIRNOM&limit=1`, {
            method: 'POST'
        });
        const scanResult = await resScan.json();
        console.log(`Scan Result: Scanned ${scanResult.scanned} pairs`);

        // 3. Get Final Stats
        console.log("3. Fetching Final Stats...");
        const res2 = await fetch(`${BASE_URL}/api/dashboard/stats`);
        const stats2 = await res2.json();
        const count2 = stats2.scanCountTotal;
        console.log(`Final Scan Count: ${count2}`);

        if (count2 > count1) {
            console.log("SUCCESS: Scan count incremented.");
            
            // Verify other requirements
            console.log("Verifying Last Scan Info...");
            if (stats2.lastOppsScan) {
                console.log("Last Scan Run ID:", stats2.lastOppsScan.run_id);
                console.log("Last Scan Net EV Threshold:", stats2.lastOppsScan.net_ev_threshold);
                console.log("Last Scan Opps Found:", stats2.lastOppsScan.opportunities_total);
                
                // Check for fields presence
                if (stats2.lastOppsScan.count_net_ev_above_threshold !== undefined) {
                    console.log("Note: count_net_ev_above_threshold is still in API response (backend), but UI hides it.");
                }
            } else {
                console.log("WARNING: lastOppsScan is null.");
            }

        } else {
            console.error("FAILURE: Scan count did not increment.");
            process.exit(1);
        }

    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

main();
