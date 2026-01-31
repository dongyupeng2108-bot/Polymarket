
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const testId = `Test_ZeroRun_${Date.now()}`;
const testDir = path.join(process.cwd(), `temp_${testId}`);
const finalizerPath = path.join(process.cwd(), 'scripts', 'finalize_task_v3.4.mjs');

console.log(`[SelfTest] Starting Zero Run Guard Test (${testId})...`);

try {
    // 1. Setup
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    
    // Create log with NO "CMD_START"
    const logContent = `[${new Date().toISOString()}] SMART_AGENT_HANDOVER_START\n[${new Date().toISOString()}] Doing work without commands...\n[${new Date().toISOString()}] SMART_AGENT_RESULT_FOUND\n`;
    fs.writeFileSync(path.join(testDir, `run_${testId}.log`), logContent);

    // 2. Run Finalizer with status=DONE
    console.log("[SelfTest] Running finalizer (Expect FAILED result due to 0 commands)...");
    try {
        execSync(`node "${finalizerPath}" --task_id ${testId} --task_dir "${testDir}" --status DONE --mode smart_agent`, { stdio: 'inherit' });
    } catch (e) {
        // Finalizer might exit 1 or 0? 
        // v3.4 usually exits 0 even if task failed, unless critical error.
    }

    // 3. Verify Result
    const resultPath = path.join(testDir, `result_${testId}.json`);
    if (!fs.existsSync(resultPath)) throw new Error("Result JSON not generated");

    const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    console.log(`[SelfTest] Result Status: ${result.status}`);
    console.log(`[SelfTest] Result Error: ${result.error}`);

    // Assertions
    if (result.status !== 'FAILED') throw new Error(`Expected status FAILED, got ${result.status}`);
    if (result.error !== 'ZERO_RUN_FALSE_POSITIVE') throw new Error(`Expected error ZERO_RUN_FALSE_POSITIVE, got ${result.error}`);
    if (result.commands_executed !== 0) throw new Error(`Expected commands_executed 0, got ${result.commands_executed}`);

    console.log("[SelfTest] ✅ PASSED: Zero Run correctly flagged as FAILED.");
    
    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true });
    process.exit(0);

} catch (e) {
    console.error(`[SelfTest] ❌ FAILED: ${e.message}`);
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
    process.exit(1);
}
