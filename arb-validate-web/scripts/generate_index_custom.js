const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function getFileStats(filePath) {
    try {
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath);
        const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
        return { size: stats.size, sha256_short: hash };
    } catch (e) {
        return null;
    }
}

const filesToIndex = [
    'manual_verification.json',
    'healthcheck_53121.txt',
    'reports/healthcheck_root.txt',
    'reports/healthcheck_pairs.txt',
    'src/app/pairs/pairs-client.tsx',
    'src/app/api/pairs/auto-match/stream/route.ts',
    'src/scripts/verify_automatch_add_pair.ts',
    'src/scripts/generate_healthcheck_real.ts',
    'src/scripts/cleanup_duplicates.ts'
];

// Look for ui_copy_details_*.json
const dir = process.cwd();
const files = fs.readdirSync(dir);
const copyDetailsFile = files.find(f => f.startsWith('ui_copy_details_') && f.endsWith('.json'));
if (copyDetailsFile) {
    filesToIndex.push(copyDetailsFile);
}

const index = {};
filesToIndex.forEach(file => {
    const stats = getFileStats(path.join(dir, file));
    if (stats) {
        index[file] = stats;
    } else {
        console.warn(`File not found or unreadable: ${file}`);
    }
});

const taskId = 'M2_1_PairsMgmt_AddPair_FromAutoMatchCandidates_260131_076';
const outputName = `deliverables_index_${taskId}.json`;
fs.writeFileSync(outputName, JSON.stringify(index, null, 2));
console.log(`Index generated: ${outputName}`);
