
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPTS_DIR = __dirname;
const PREFLIGHT_SCRIPT = path.join(SCRIPTS_DIR, 'preflight_validate_task.mjs');

console.log(`[Verify] Starting verification using ${PREFLIGHT_SCRIPT}`);

function log(msg) {
    console.log(msg);
}

function runPreflight(taskFile) {
    try {
        execSync(`node "${PREFLIGHT_SCRIPT}" "${taskFile}"`, { stdio: 'pipe' });
        return { code: 0, output: 'PASS' };
    } catch (e) {
        return { code: e.status, output: e.stderr.toString() };
    }
}

// 1. Create Valid Task
const validTask = `task_id: TEST_VALID_001
milestone: M1.5
RUN:
CMD: echo "hello"
MODE=TASK FIRSTLINE=task_id NO_CODEBLOCK HAS_MILESTONE+RUN RUN_CMDS_OK END_SENTINEL_OK FAIL_FAST_OK
本次任务发布完毕。`;

const validPath = path.join(SCRIPTS_DIR, 'temp_valid.md');
fs.writeFileSync(validPath, validTask);

log('--- Test 1: Valid Task ---');
const res1 = runPreflight(validPath);
if (res1.code === 0) {
    log('PASS: Valid task passed.');
} else {
    log(`FAIL: Valid task failed! Output: ${res1.output}`);
    process.exit(1);
}
fs.unlinkSync(validPath);

// 2. Create Missing Sentinel Task
const invalidTask1 = `task_id: TEST_INVALID_001
milestone: M1.5
RUN:
CMD: echo "hello"
MODE=TASK FIRSTLINE=task_id NO_CODEBLOCK HAS_MILESTONE+RUN RUN_CMDS_OK END_SENTINEL_OK FAIL_FAST_OK`;
// Missing sentinel

const invalidPath1 = path.join(SCRIPTS_DIR, 'temp_invalid_sentinel.md');
fs.writeFileSync(invalidPath1, invalidTask1);

log('--- Test 2: Missing Sentinel ---');
const res2 = runPreflight(invalidPath1);
if (res2.code === 1 && res2.output.includes('MISSING_SENTINEL')) {
    log('PASS: Detected missing sentinel.');
} else {
    log(`FAIL: Failed to detect missing sentinel. Code: ${res2.code}, Output: ${res2.output}`);
    process.exit(1);
}
fs.unlinkSync(invalidPath1);

// 3. Create Forbidden Prefix Task
const invalidTask2 = `task_id: TEST_INVALID_002
milestone: M1.5
TraeTask detected here
RUN:
CMD: echo "hello"
本次任务发布完毕。`;

const invalidPath2 = path.join(SCRIPTS_DIR, 'temp_invalid_prefix.md');
fs.writeFileSync(invalidPath2, invalidTask2);

log('--- Test 3: Forbidden Prefix ---');
const res3 = runPreflight(invalidPath2);
if (res3.code === 1 && res3.output.includes('KILL_SWITCH_TRAETASK_PREFIX')) {
    log('PASS: Detected TraeTask prefix/content.');
} else {
    log(`FAIL: Failed to detect forbidden content. Code: ${res3.code}, Output: ${res3.output}`);
    process.exit(1);
}
fs.unlinkSync(invalidPath2);

log('[Verify] All tests passed.');
