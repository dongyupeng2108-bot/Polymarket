import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_TRAEBACK = 'E:\\polymaket\\Github\\traeback';
const TEST_ID_PREFIX = 'SelfTest_FinalizerTaskDir_ZipOff';
const TIMESTAMP = Date.now();
const TASK_ID = `${TEST_ID_PREFIX}_${TIMESTAMP}`;
const EXPECTED_RESULT_DIR = path.join(ROOT_TRAEBACK, 'results', TASK_ID);

console.log(`[SelfTest] Starting ${TASK_ID}...`);

try {
    console.log(`[SelfTest] Creating test environment at ${EXPECTED_RESULT_DIR}`);
    if (fs.existsSync(EXPECTED_RESULT_DIR)) {
        fs.rmSync(EXPECTED_RESULT_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(EXPECTED_RESULT_DIR, { recursive: true });

    fs.writeFileSync(path.join(EXPECTED_RESULT_DIR, 'agent_done.json'), '{}');
    
    const evidenceContent = `
[${new Date().toISOString()}] Start Task
[${new Date().toISOString()}] SMART_AGENT_HANDOVER_START
[${new Date().toISOString()}] Working...
[${new Date().toISOString()}] SMART_AGENT_RESULT_FOUND
[${new Date().toISOString()}] Done
`;
    fs.writeFileSync(path.join(EXPECTED_RESULT_DIR, 'evidence.log'), evidenceContent);

    console.log(`[SelfTest] Executing Finalizer with task_dir=${ROOT_TRAEBACK} (expecting resolution to ${EXPECTED_RESULT_DIR})`);
    
    const cmd = `node scripts/finalize_task_v3.4.mjs --task_id ${TASK_ID} --task_dir "${ROOT_TRAEBACK}" --zip off --status DONE --summary "selftest"`;
    
    const output = execSync(cmd, { cwd: ROOT_TRAEBACK, encoding: 'utf8' });
    console.log(`[SelfTest] Output:\n${output}`);

    if (!output.includes(`Resolved task_dir => ${EXPECTED_RESULT_DIR}`)) {
        throw new Error("Finalizer did not resolve task_dir correctly.");
    }

    const runLogPath = path.join(EXPECTED_RESULT_DIR, `run_${TASK_ID}.log`);
    const resultJsonPath = path.join(EXPECTED_RESULT_DIR, `result_${TASK_ID}.json`);
    
    if (!fs.existsSync(runLogPath)) throw new Error("run log not found in results dir");
    if (!fs.existsSync(resultJsonPath)) throw new Error("result json not found in results dir");

    const runLogContent = fs.readFileSync(runLogPath, 'utf8');
    if (!runLogContent.includes('SMART_AGENT_HANDOVER_START') || !runLogContent.includes('SMART_AGENT_RESULT_FOUND')) {
        throw new Error("run log missing markers");
    }

    const resultJson = JSON.parse(fs.readFileSync(resultJsonPath, 'utf8'));
    if (resultJson.markers_detected !== true) throw new Error("result.json markers_detected is not true");
    if (resultJson.zip_requested !== "off") throw new Error("result.json zip_requested is not off");
    if (resultJson.zip_generated !== false) throw new Error("result.json zip_generated is not false");
    if (resultJson.artifacts.bundle_zip) throw new Error("result.json artifacts contains bundle_zip when zip=off");

    const bundlePath = path.join(EXPECTED_RESULT_DIR, `bundle_${TASK_ID}.zip`);
    if (fs.existsSync(bundlePath)) throw new Error("bundle zip exists when zip=off");

    console.log("[SelfTest] PASS: All checks passed.");
    
} catch (e) {
    console.error(`[SelfTest] FAIL: ${e.message}`);
    process.exit(1);
}
