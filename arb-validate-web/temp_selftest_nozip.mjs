
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRAEBACK_ROOT = path.resolve(__dirname, '..');
const RESULTS_ROOT = path.join(TRAEBACK_ROOT, 'results');
const SCRIPTS_DIR = path.join(TRAEBACK_ROOT, 'scripts');
const FINALIZER_SCRIPT = path.join(SCRIPTS_DIR, 'finalize_task_v3.4.mjs');
// Check if Handover script exists
const HANDOVER_SCRIPT = path.join(SCRIPTS_DIR, 'smart_agent_handover.mjs');
const HAS_HANDOVER = fs.existsSync(HANDOVER_SCRIPT);

function runCmd(cmd, cwd = TRAEBACK_ROOT) {
    try {
        return execSync(cmd, { cwd, encoding: 'utf8', stdio: 'pipe' }); // Use pipe to capture output
    } catch (e) {
        // Capture stdout even if it fails
        const output = e.stdout || '';
        const error = e.stderr || '';
        throw new Error(`Command failed: ${cmd}\nSTDOUT: ${output}\nSTDERR: ${error}`);
    }
}

function cleanup(taskId) {
    const dir = path.join(RESULTS_ROOT, taskId);
    if (fs.existsSync(dir)) {
        try {
            fs.rmSync(dir, { recursive: true, force: true });
        } catch (e) {
            console.warn(`[Cleanup] Failed to remove ${dir}: ${e.message}`);
        }
    }
}

function assertNoZip(taskId, output, expectZipRequested) {
    const dir = path.join(RESULTS_ROOT, taskId);
    const resultPath = path.join(dir, `result_${taskId}.json`);
    const indexPath = path.join(dir, `deliverables_index_${taskId}.json`);

    // Check 1: No zip files in directory
    const files = fs.readdirSync(dir);
    const zipFiles = files.filter(f => f.endsWith('.zip'));
    if (zipFiles.length > 0) {
        throw new Error(`[FAIL] Found zip files in ${dir}: ${zipFiles.join(', ')}`);
    }

    // Check 2: Result JSON metadata
    if (!fs.existsSync(resultPath)) throw new Error(`[FAIL] result.json not found`);
    const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    
    if (result.zip_disabled !== true) throw new Error(`[FAIL] zip_disabled is not true`);
    if (result.zip_generated !== false) throw new Error(`[FAIL] zip_generated is not false`);
    if (result.zip_requested !== expectZipRequested) throw new Error(`[FAIL] zip_requested expected '${expectZipRequested}', got '${result.zip_requested}'`);
    if (result.artifacts.bundle_zip) throw new Error(`[FAIL] artifacts.bundle_zip exists`);

    // Check 3: Deliverables Index
    if (!fs.existsSync(indexPath)) throw new Error(`[FAIL] index.json not found`);
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    const zipEntries = index.files.filter(f => f.name.endsWith('.zip'));
    if (zipEntries.length > 0) throw new Error(`[FAIL] Index contains zip entries: ${JSON.stringify(zipEntries)}`);

    console.log(`[PASS] Assertions for ${taskId}`);
}

async function runTests() {
    console.log("[SelfTest] Starting No-Zip Pipeline Test...");
    const ts = Date.now();

    // === Case 1: Finalizer Direct Call (--zip on) ===
    {
        const taskId = `SelfTest_NoZip_Finalizer_On_${ts}`;
        console.log(`\n=== Case 1: Finalizer Direct (--zip on) - ${taskId} ===`);
        const taskDir = path.join(RESULTS_ROOT, taskId);
        fs.mkdirSync(taskDir, { recursive: true });
        fs.writeFileSync(path.join(taskDir, 'agent_done.json'), '{}');
        fs.writeFileSync(path.join(taskDir, 'evidence.log'), 'Simulated evidence log');
        // Add marker
        fs.writeFileSync(path.join(taskDir, `run_${taskId}.log`), `[${new Date().toISOString()}] SMART_AGENT_HANDOVER_START\n[${new Date().toISOString()}] SMART_AGENT_RESULT_FOUND\n`);

        const cmd = `node "${FINALIZER_SCRIPT}" --task_id ${taskId} --task_dir "${taskDir}" --zip on --status DONE --summary "selftest case 1"`;
        const output = runCmd(cmd);
        // console.log(output);
        assertNoZip(taskId, output, 'on');
    }

    // === Case 2: Handover Call (--zip on) ===
    if (HAS_HANDOVER) {
        const taskId = `SelfTest_NoZip_Handover_On_${ts}`;
        console.log(`\n=== Case 2: Handover Script (--zip on) - ${taskId} ===`);
        // Note: Handover script looks for task file in RUNNING_DIR, or accepts explicit task_id.
        // It creates the results dir.
        // We need to trick it. It waits for agent_done.json.
        // We can run handover in background, then write agent_done.json?
        // Or simpler: Handover script logic:
        // 1. Detect task ID (pass --task_id)
        // 2. Create dir
        // 3. Wait for agent_done.json
        // 4. Run Finalizer

        // To test this synchronously without hanging, we need to pre-create agent_done.json?
        // Handover checks existence.
        
        const taskDir = path.join(RESULTS_ROOT, taskId);
        if (fs.existsSync(taskDir)) fs.rmSync(taskDir, { recursive: true, force: true });
        // Create dir and done flag beforehand so Handover doesn't wait?
        // Handover: if (fs.existsSync(doneFlag)) break;
        // But Handover creates dir: if (!fs.existsSync(taskDir)) fs.mkdirSync...
        
        // Let's pre-create the done flag. But Handover might delete/recreate?
        // Handover logic:
        // const taskDir = path.join(RESULTS_DIR, taskId);
        // if (!fs.existsSync(taskDir)) fs.mkdirSync...
        
        // So if we pre-create, it's fine.
        fs.mkdirSync(taskDir, { recursive: true });
        fs.writeFileSync(path.join(taskDir, 'agent_done.json'), '{}');
        
        const cmd = `node "${HANDOVER_SCRIPT}" --task_id ${taskId} --zip on`;
        const output = runCmd(cmd); // Should detect done flag immediately and run finalizer
        // console.log(output);
        assertNoZip(taskId, output, 'on');
    } else {
        console.log("\n[SKIP] Case 2: Handover script not found.");
    }

    // === Case 3: Finalizer Direct Call (--zip off) ===
    {
        const taskId = `SelfTest_NoZip_Finalizer_Off_${ts}`;
        console.log(`\n=== Case 3: Finalizer Direct (--zip off) - ${taskId} ===`);
        const taskDir = path.join(RESULTS_ROOT, taskId);
        fs.mkdirSync(taskDir, { recursive: true });
        fs.writeFileSync(path.join(taskDir, 'agent_done.json'), '{}');
        fs.writeFileSync(path.join(taskDir, 'evidence.log'), 'Simulated evidence log');
         // Add marker
        fs.writeFileSync(path.join(taskDir, `run_${taskId}.log`), `[${new Date().toISOString()}] SMART_AGENT_HANDOVER_START\n[${new Date().toISOString()}] SMART_AGENT_RESULT_FOUND\n`);

        const cmd = `node "${FINALIZER_SCRIPT}" --task_id ${taskId} --task_dir "${taskDir}" --zip off --status DONE --summary "selftest case 3"`;
        const output = runCmd(cmd);
        // console.log(output);
        assertNoZip(taskId, output, 'off');
    }

    console.log("\n[SelfTest] ALL CHECKS PASSED");
}

try {
    // Set a timeout of 10s as per requirement
    const timer = setTimeout(() => {
        console.error("[SelfTest] TIMEOUT (10s)");
        process.exit(1);
    }, 10000);

    runTests().then(() => {
        clearTimeout(timer);
        process.exit(0);
    }).catch(e => {
        clearTimeout(timer);
        console.error(`[SelfTest] FAIL: ${e.message}`);
        process.exit(1);
    });
} catch (e) {
    console.error(`[SelfTest] FATAL: ${e.message}`);
    process.exit(1);
}
