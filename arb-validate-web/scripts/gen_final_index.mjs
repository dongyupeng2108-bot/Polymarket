
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const taskId = 'M1_Bridge_Postflight_Enforce_Status_And_IndexHashSize_And_HealthcheckSummary_260127_057';
const projectRoot = path.resolve('E:\\polymaket\\program');
const webRoot = path.join(projectRoot, 'arb-validate-web');

const files = [
    'arb-validate-web/scripts/postflight_validate_envelope.mjs',
    'arb-validate-web/postflight_selftest_057.txt',
    'arb-validate-web/healthcheck_53121.txt',
    'arb-validate-web/scripts/docs_locate_057.txt',
    '.trae/rules/workflow-v39.md',
    '.trae/rules/project-rules-concise.md'
];

function calculateHash(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    return hashSum.digest('hex').substring(0, 8); // Short hash
}

const deliverables = files.map(relPath => {
    const fullPath = path.join(projectRoot, relPath);
    if (!fs.existsSync(fullPath)) {
        console.error(`File not found: ${fullPath}`);
        process.exit(1);
    }
    const stats = fs.statSync(fullPath);
    // Make path relative to arb-validate-web (where index is)
    // Use forward slashes for consistency
    const relativePath = path.relative(webRoot, fullPath).replace(/\\/g, '/');
    
    return {
        path: relativePath, 
        size: stats.size,
        sha256_short: calculateHash(fullPath)
    };
});

const indexContent = {
    task_id: taskId,
    files: deliverables
};

fs.writeFileSync(path.join(webRoot, `deliverables_index_${taskId}.json`), JSON.stringify(indexContent, null, 2));
console.log('Index generated successfully.');
