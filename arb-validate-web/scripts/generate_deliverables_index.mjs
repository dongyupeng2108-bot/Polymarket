
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

const taskId = process.argv[2];
if (!taskId) {
    console.error("Usage: node generate_deliverables_index.mjs <task_id>");
    process.exit(1);
}

const files = [
    'src/app/api/pairs/auto-match/stream/route.ts',
    'src/app/pairs/pairs-client.tsx',
    'scripts/manual_capture_sse_autmatch.ts',
    'scripts/manual_test_kalshi_search_matrix.ts',
    'scripts/simulate_copy_details.ts',
    'kalshi_search_matrix.out',
    'sse_capture_auto_limit50.out',
    'ui_copy_details_completed.json',
    'healthcheck_53121.txt'
];

const index = {};

files.forEach(f => {
    if (fs.existsSync(f)) {
        const stats = fs.statSync(f);
        const content = fs.readFileSync(f);
        const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
        index[f] = {
            size: stats.size,
            sha256_short: hash
        };
    } else {
        console.warn(`Warning: File not found: ${f}`);
    }
});

// Self reference
const outName = `deliverables_index_${taskId}.json`;
// We can't hash the file we are writing, so we add a placeholder or just omit self-ref from hash, 
// but the spec says "SELF_REF 仅允许指向自身且磁盘可找到".
// We will write it first, then update it? Or just write it.
// The spec says "deliverables_index 中列出的文件必须真实存在".
// Usually self-ref is for the index itself.
index[outName] = { size: 0, sha256_short: "PENDING" };

fs.writeFileSync(outName, JSON.stringify(index, null, 2));

// Update self-ref
const stats = fs.statSync(outName);
const content = fs.readFileSync(outName);
const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
index[outName] = { size: stats.size, sha256_short: hash };
fs.writeFileSync(outName, JSON.stringify(index, null, 2));

console.log(`Generated ${outName}`);
