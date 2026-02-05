
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPORT_FILE = path.join(__dirname, '../docs/smoke_report.json');
const BASE_URL = 'http://localhost:53121'; // Port updated to 53121

const evidence = {
    timestamp: new Date().toISOString(),
    verify_kh_proxy: null,
    network_health: null,
    scan_once: null,
    opportunities_list: null,
    summary: {
        status: 'PENDING',
        passed_checks: 0,
        total_checks: 4,
        opportunities_found: 0
    }
};

async function runStep(name, url, method = 'GET') {
    console.log(`[Step] ${name}: ${method} ${url}`);
    try {
        const res = await axios({ method, url, validateStatus: () => true });
        console.log(`  -> Status: ${res.status}`);
        return {
            status: res.status,
            data: res.data
        };
    } catch (e) {
        console.error(`  -> FAILED: ${e.message}`);
        return {
            status: 0,
            error: e.message,
            code: e.code
        };
    }
}

async function main() {
    console.log('--- Starting Smoke Test (M?: Local Opportunities + Proxy Fix) ---');

    // 0. Verify KH Proxy Script
    console.log('[Step] Verify Proxy Script (npx tsx scripts/verify_kh_proxy.ts)...');
    try {
        const output = execSync('npx tsx scripts/verify_kh_proxy.ts', { encoding: 'utf-8', env: process.env, stdio: ['ignore', 'pipe', 'ignore'] });
        try {
             const result = JSON.parse(output);
             evidence.verify_kh_proxy = result;
             console.log(`  -> HTTP Status: ${result.http_status}, Elapsed: ${result.elapsed_ms}ms`);
             if (result.http_status === 200 || result.http_status === 401) {
                 evidence.summary.passed_checks++;
             }
        } catch(parseErr) {
             console.error('  -> Output Parse Error:', output);
             evidence.verify_kh_proxy = { error: 'parse_error', raw: output };
        }
    } catch (e) {
        console.error('  -> Script Failed');
        evidence.verify_kh_proxy = { error: 'script_failed', message: e.message };
        // Try to recover stdout if present
        if (e.stdout) {
             try {
                evidence.verify_kh_proxy = JSON.parse(e.stdout.toString());
             } catch(err){}
        }
    }

    // 1. Network Health
    const healthRes = await runStep('Network Health', `${BASE_URL}/api/health/network`);
    evidence.network_health = healthRes;
    if (healthRes.status === 200 && (healthRes.data.kalshi_status === 'OK' || healthRes.data.http_status === 401)) {
        // Allow 401 as "OK" for connectivity check context, though API might say DOWN/http_401. 
        // User said: "stage 不再停在 http timeout".
        // If API returns http_401, that is success for connectivity.
        evidence.summary.passed_checks++;
    }

    // 2. Scan Once (Trigger logic)
    let pairId = 48; // Default
    try {
        const pairsRes = await axios.get(`${BASE_URL}/api/pairs?status=verified`);
        if (pairsRes.data && pairsRes.data.pairs && pairsRes.data.pairs.length > 0) {
            pairId = pairsRes.data.pairs[0].id;
            console.log(`  -> Found Verified Pair #${pairId}`);
        } else {
            console.log('  -> No VERIFIED pairs found, trying ID 48 (seeded)');
        }
    } catch (e) {
        console.log('  -> Failed to list pairs, using ID 48');
    }

    const scanRes = await runStep('Scan Once', `${BASE_URL}/api/scan/once?pairId=${pairId}`, 'POST');
    evidence.scan_once = scanRes;
    if (scanRes.status === 200) evidence.summary.passed_checks++;

    // 3. Opportunities List
    const oppsRes = await runStep('Opportunities List', `${BASE_URL}/api/opportunities?page=1&pageSize=20`);
    evidence.opportunities_list = oppsRes;
    if (oppsRes.status === 200) {
        evidence.summary.passed_checks++;
        if (oppsRes.data.data && oppsRes.data.data.length > 0) {
            evidence.summary.opportunities_found = oppsRes.data.data.length;
            console.log(`  -> SUCCESS: Found ${oppsRes.data.data.length} opportunities!`);
        } else {
            console.log('  -> WARNING: 0 Opportunities found (Check Threshold/Network)');
        }
    }

    // Final Verdict
    if (healthRes.status === 0 || healthRes.code === 'ECONNREFUSED') {
        console.error('CRITICAL: Server not reachable.');
        evidence.summary.status = 'CRASHED';
        fs.writeFileSync(REPORT_FILE, JSON.stringify(evidence, null, 2));
        process.exit(1);
    }

    evidence.summary.status = 'COMPLETED';
    fs.writeFileSync(REPORT_FILE, JSON.stringify(evidence, null, 2));
    console.log(`\nSmoke Test Complete. Report saved to ${REPORT_FILE}`);
}

main();
