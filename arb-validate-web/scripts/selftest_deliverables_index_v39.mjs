
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const FILES = [
    'src/app/api/pairs/auto-match/stream/route.ts',
    'scripts/manual_test_kalshi_search_matrix.ts',
    'healthcheck_53121.txt',
    'sse_capture_limit50.out',
    'kalshi_search_matrix.out',
    'result_M1_5_AutoMatch_KalshiUniverse_SearchMatrix_And_ConfigurableUniverseMode_260127_058.json',
    'run_M1_5_AutoMatch_KalshiUniverse_SearchMatrix_And_ConfigurableUniverseMode_260127_058.log'
];

const TASK_ID = 'M1_5_AutoMatch_KalshiUniverse_SearchMatrix_And_ConfigurableUniverseMode_260127_058';
const OUTPUT_FILE = `deliverables_index_${TASK_ID}.json`;

function getFileHash(filePath) {
    try {
        const content = fs.readFileSync(filePath);
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        return hash.substring(0, 8); // sha256_short
    } catch (e) {
        return null;
    }
}

function getFileSize(filePath) {
    try {
        const stats = fs.statSync(filePath);
        return stats.size;
    } catch (e) {
        return -1;
    }
}

const index = [];

console.log(`Generating index for ${FILES.length} files...`);

for (const file of FILES) {
    const absPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(absPath)) {
        index.push({
            path: file,
            size: getFileSize(absPath),
            sha256_short: getFileHash(absPath)
        });
        console.log(`[OK] ${file}`);
    } else {
        console.error(`[MISSING] ${file}`);
        // Add placeholder or fail? User wants "Full Envelope".
        // If missing, we can't calculate hash.
    }
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2));
console.log(`Index written to ${OUTPUT_FILE}`);
