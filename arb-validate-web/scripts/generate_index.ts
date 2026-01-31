
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';

const files = [
    'healthcheck_53121.txt',
    'sse_capture_limit50.out',
    'sse_capture_limit1000.out',
    'ui_copy_details_completed.json',
    'top_by_category_pm.json',
    'top_by_category_kalshi.json',
    'top_by_category_compare.csv',
    'result_M2_5_AutoMatch_Fix_Candidates0_By_TopicAlignedUniverse_And_FuzzyMatch_260128_066.json',
    'run_M2_5_AutoMatch_Fix_Candidates0_By_TopicAlignedUniverse_And_FuzzyMatch_260128_066.log'
];

const index: any = {
    task_id: "M2_5_AutoMatch_Fix_Candidates0_By_TopicAlignedUniverse_And_FuzzyMatch_260128_066",
    timestamp: new Date().toISOString(),
    files: {}
};

for (const file of files) {
    const p = path.join('reports', file);
    if (fs.existsSync(p)) {
        const content = fs.readFileSync(p);
        const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
        index.files[file] = {
            size: content.length,
            sha256_short: hash
        };
    } else {
        index.files[file] = "MISSING";
    }
}

// Write index file
fs.writeFileSync('reports/deliverables_index_M2_5_AutoMatch_Fix_Candidates0_By_TopicAlignedUniverse_And_FuzzyMatch_260128_066.json', JSON.stringify(index, null, 2));
console.log('Index generated.');
