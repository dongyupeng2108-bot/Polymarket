import http from 'http';

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);

function getArg(name, defaultValue) {
    const index = args.indexOf(name);
    if (index !== -1 && index + 1 < args.length) {
        return args[index + 1];
    }
    const arg = args.find(a => a.startsWith(name + '='));
    if (arg) {
        return arg.split('=')[1];
    }
    return defaultValue;
}

const PORT = parseInt(getArg('--port', '53121'));
const PATHS = (getArg('--paths', '/,/pairs')).split(',');
const TIMEOUT = parseInt(getArg('--timeoutMs', '15000'));
const OUTPUT_FILE = getArg('--output', null);

console.log(`[HealthCheck] Target: http://localhost:${PORT}`);
console.log(`[HealthCheck] Paths: ${PATHS.join(', ')}`);
console.log(`[HealthCheck] Timeout: ${TIMEOUT}ms`);

async function checkPath(p) {
    return new Promise((resolve, reject) => {
        const url = `http://localhost:${PORT}${p}`;
        const req = http.get(url, (res) => {
            console.log(`[HealthCheck] ${p} -> ${res.statusCode}`);
            if (res.statusCode === 200) {
                resolve(true);
            } else {
                reject(new Error(`Status ${res.statusCode}`));
            }
        });

        req.on('error', (e) => reject(e));
        
        req.setTimeout(TIMEOUT, () => {
            req.destroy();
            reject(new Error('Timeout'));
        });
    });
}

async function run() {
    const results = [];
    let allPassed = true;

    for (const p of PATHS) {
        try {
            await checkPath(p);
            results.push({ path: p, status: 'PASS' });
        } catch (e) {
            console.error(`[HealthCheck] ${p} -> FAIL: ${e.message}`);
            results.push({ path: p, status: 'FAIL', error: e.message });
            allPassed = false;
        }
    }

    if (OUTPUT_FILE) {
        try {
            const outputDir = path.dirname(OUTPUT_FILE);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
                timestamp: new Date().toISOString(),
                port: PORT,
                results: results,
                overall_status: allPassed ? 'PASSED' : 'FAILED'
            }, null, 2));
            console.log(`[HealthCheck] Result written to ${OUTPUT_FILE}`);
        } catch (e) {
            console.error(`[HealthCheck] Failed to write output file: ${e.message}`);
        }
    }

    if (!allPassed) {
        console.error('[HealthCheck] FAILED');
        process.exit(2);
    } else {
        console.log('[HealthCheck] PASSED');
        process.exit(0);
    }
}

run();
