import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT = path.join(__dirname, 'postflight_validate_envelope.mjs');
const TEMP_ROOT = path.join(__dirname, 'temp_test_postflight');

function setup(caseName) {
    const dir = path.join(TEMP_ROOT, caseName);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function run(caseName, taskId, dir) {
    console.log(`\n--- Running Case: ${caseName} ---`);
    try {
        execSync(`node "${SCRIPT}" --task_id "${taskId}" --result_dir "${dir}"`, { stdio: 'inherit' });
        console.log(`RESULT: PASS`);
    } catch (e) {
        console.log(`RESULT: FAIL (Expected for negative tests)`);
    }
}

// Case 1: Valid
const dir1 = setup('valid');
const tid1 = 'T001';
fs.writeFileSync(path.join(dir1, `result_${tid1}.json`), '{}');
fs.writeFileSync(path.join(dir1, `notify_${tid1}.txt`), 'RESULT_JSON\nLOG_HEAD\nLOG_TAIL\nINDEX\n');
fs.writeFileSync(path.join(dir1, `run_${tid1}.log`), 'A'.repeat(200));
fs.writeFileSync(path.join(dir1, `deliverables_index_${tid1}.json`), JSON.stringify({ files: [] }));
fs.writeFileSync(path.join(dir1, `LATEST.json`), '{}');
run('Valid', tid1, dir1);

// Case 2: Missing Log
const dir2 = setup('missing_log');
const tid2 = 'T002';
fs.writeFileSync(path.join(dir2, `result_${tid2}.json`), '{}');
fs.writeFileSync(path.join(dir2, `notify_${tid2}.txt`), 'RESULT_JSON\nLOG_HEAD\nLOG_TAIL\nINDEX\n');
// Missing log
fs.writeFileSync(path.join(dir2, `deliverables_index_${tid2}.json`), JSON.stringify({ files: [] }));
fs.writeFileSync(path.join(dir2, `LATEST.json`), '{}');
run('Missing Log', tid2, dir2);

// Case 3: Log Too Small
const dir3 = setup('small_log');
const tid3 = 'T003';
fs.writeFileSync(path.join(dir3, `result_${tid3}.json`), '{}');
fs.writeFileSync(path.join(dir3, `notify_${tid3}.txt`), 'RESULT_JSON\nLOG_HEAD\nLOG_TAIL\nINDEX\n');
fs.writeFileSync(path.join(dir3, `run_${tid3}.log`), 'Too small');
fs.writeFileSync(path.join(dir3, `deliverables_index_${tid3}.json`), JSON.stringify({ files: [] }));
fs.writeFileSync(path.join(dir3, `LATEST.json`), '{}');
run('Small Log', tid3, dir3);

// Case 4: Missing Envelope Section
const dir4 = setup('missing_section');
const tid4 = 'T004';
fs.writeFileSync(path.join(dir4, `result_${tid4}.json`), '{}');
fs.writeFileSync(path.join(dir4, `notify_${tid4}.txt`), 'RESULT_JSON\nLOG_HEAD\n'); // Missing TAIL, INDEX
fs.writeFileSync(path.join(dir4, `run_${tid4}.log`), 'A'.repeat(200));
fs.writeFileSync(path.join(dir4, `deliverables_index_${tid4}.json`), JSON.stringify({ files: [] }));
fs.writeFileSync(path.join(dir4, `LATEST.json`), '{}');
run('Missing Section', tid4, dir4);
