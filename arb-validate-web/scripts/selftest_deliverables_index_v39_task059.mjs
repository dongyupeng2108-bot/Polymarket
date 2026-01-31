
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const TASK_ID = 'M1_5_AutoMatch_UniverseMode_AutoSwitch_SearchKeywords_And_UIControl_260127_059';

const FILES = [
    'src/app/api/pairs/auto-match/stream/route.ts',
    'src/app/pairs/pairs-client.tsx',
    'scripts/manual_capture_sse_autmatch.ts',
    'scripts/manual_test_kalshi_search_matrix.ts',
    'kalshi_search_matrix.out',
    'sse_capture_auto_limit50.out',
    'ui_copy_details_completed.json',
    'healthcheck_53121.txt',
    `result_${TASK_ID}.json`,
    `run_${TASK_ID}.log`
];

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
        console.warn(`[MISSING] ${file} (might be generated later)`);
    }
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index, null, 2));
console.log(`Index written to ${OUTPUT_FILE}`);
