
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const testId = `Test_ManVerify_${Date.now()}`;
const testDir = path.join(process.cwd(), `temp_${testId}`);
const finalizerPath = path.join(process.cwd(), 'scripts', 'finalize_task_v3.4.mjs');

console.log(`[SelfTest] Starting Manual Evidence Test (${testId})...`);

try {
    // 1. Setup
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    
    // Create log with commands (to avoid Zero Run failure)
    const logContent = `[${new Date().toISOString()}] SMART_AGENT_HANDOVER_START\n[${new Date().toISOString()}] CMD_START: echo "Fake Work"\n[${new Date().toISOString()}] SMART_AGENT_RESULT_FOUND\n`;
    fs.writeFileSync(path.join(testDir, `run_${testId}.log`), logContent);

    // 2. Run Finalizer with --manual_verify BUT NO manual_verification.json
    console.log("[SelfTest] Running finalizer with --manual_verify but missing file (Expect FAILED)...");
    try {
        // We assume we will add a --manual_verify flag
        execSync(`node "${finalizerPath}" --task_id ${testId} --task_dir "${testDir}" --status DONE --mode smart_agent --manual_verify`, { stdio: 'inherit' });
    } catch (e) {
        // Ignore exit code
    }

    // 3. Verify Result
    const resultPath = path.join(testDir, `result_${testId}.json`);
    if (!fs.existsSync(resultPath)) throw new Error("Result JSON not generated");

    const result = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
    console.log(`[SelfTest] Result Status: ${result.status}`);
    console.log(`[SelfTest] Result Error: ${result.error}`);

    // Assertions
    if (result.status !== 'FAILED') throw new Error(`Expected status FAILED, got ${result.status}`);
    if (result.error !== 'MANUAL_EVIDENCE_MISSING') throw new Error(`Expected error MANUAL_EVIDENCE_MISSING, got ${result.error}`);
    
    // Check if acceptance check contains the failed item
    const checkItem = result.acceptance_check.find(i => i.item.includes("Manual Verification"));
    // It might be present and failed, or just result failed.
    // The requirement says: "If acceptance_check ...=true ... else FAILED".
    // Since we failed, the acceptance check for it might be False or missing?
    // Actually, if we requested it and it's missing, we should probably record it as Failed.
    
    console.log("[SelfTest] ✅ PASSED: Missing evidence correctly flagged as FAILED.");
    
    // Cleanup
    fs.rmSync(testDir, { recursive: true, force: true });
    process.exit(0);

} catch (e) {
    console.error(`[SelfTest] ❌ FAILED: ${e.message}`);
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch {}
    process.exit(1);
}
