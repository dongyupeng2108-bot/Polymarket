const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const taskId = 'M2_1_PairsMgmt_AutoMatch_Fix_260131_001';
const rootDir = path.resolve(__dirname, '..');
const files = [
  'src/app/api/pairs/auto-match/stream/route.ts',
  'src/app/pairs/pairs-client.tsx',
  'manual_verification.json',
  'ui_copy_details_automatch_req_sim_001.json',
  'reports/healthcheck_root.txt',
  'reports/healthcheck_pairs.txt',
  `run_${taskId}.log`,
  `result_${taskId}.json`,
  'scripts/postflight_validate_envelope.mjs',
  'src/scripts/verify_automatch_fix.ts',
  'healthcheck_53121.txt'
];

const index = {};

files.forEach(file => {
  const filePath = path.join(rootDir, file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
    index[file] = {
      size: content.length,
      sha256_short: hash
    };
  } else {
    console.warn(`Warning: File not found: ${file}`);
  }
});

fs.writeFileSync(path.join(rootDir, `deliverables_index_${taskId}.json`), JSON.stringify(index, null, 2));
console.log('Index generated.');
