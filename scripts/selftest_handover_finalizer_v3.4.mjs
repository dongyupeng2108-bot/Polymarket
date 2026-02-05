import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RUNNING_DIR = path.join(ROOT, 'running');
const RESULTS_DIR = path.join(ROOT, 'results');
const LOG_FILE = path.join(ROOT, 'evidence.log');

const log = (msg) => {
    const line = `[SelfTest] ${msg}`;
    console.log(line);
    fs.appendFileSync(LOG_FILE, line + '\n');
};

async function runCase(caseName, zipMode) {
    log(`=== Running Case: ${caseName} (zip=${zipMode}) ===`);
    const taskId = `SelfTest_${caseName}_${Date.now()}`;
    const taskFile = path.join(RUNNING_DIR, `TraeTask_${taskId}.md`);
    
    // 1. Setup
    if (!fs.existsSync(RUNNING_DIR)) fs.mkdirSync(RUNNING_DIR, { recursive: true });
    
    // Clean up old SelfTest files to avoid confusion (though we use --task_id now)
    try {
        const files = fs.readdirSync(RUNNING_DIR);
        files.forEach(f => {
            if (f.startsWith('TraeTask_SelfTest_')) {
                fs.unlinkSync(path.join(RUNNING_DIR, f));
            }
        });
    } catch (e) {}

    fs.writeFileSync(taskFile, `task_id: ${taskId}\nCMD: echo hello`);
    
    const resultDir = path.join(RESULTS_DIR, taskId);
    if (fs.existsSync(resultDir)) fs.rmSync(resultDir, { recursive: true, force: true });
    
    // 2. Start Handover (Async) with Explicit Task ID
    log(`Starting handover script for ${taskId}...`);
    const child = spawn('node', ['scripts/smart_agent_handover.mjs', '--zip', zipMode, '--task_id', taskId], {
        cwd: ROOT,
        stdio: 'pipe'
    });
    
    let stdout = '';
    child.stdout.on('data', d => { stdout += d.toString(); process.stdout.write(d); });
    child.stderr.on('data', d => { process.stderr.write(d); });
    
    // 3. Simulate Agent Work
    await new Promise(r => setTimeout(r, 2000));
    log(`Simulating agent done...`);
    
    // Ensure result dir exists (handover should have created it)
    if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });
    
    // Write agent_done.json
    fs.writeFileSync(path.join(resultDir, 'agent_done.json'), JSON.stringify({ status: 'DONE' }));
    
    // 4. Wait for finish
    await new Promise((resolve, reject) => {
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Handover failed with code ${code}`));
        });
        // Timeout
        setTimeout(() => { child.kill(); reject(new Error("Timeout")); }, 15000);
    });
    
    log(`Handover finished.`);
    
    // 5. Verify
    const runLog = path.join(resultDir, `run_${taskId}.log`);
    if (!fs.existsSync(runLog)) throw new Error("run.log missing");
    
    const logContent = fs.readFileSync(runLog, 'utf8');
    if (!logContent.includes('SMART_AGENT_HANDOVER_START')) throw new Error("Missing START marker");
    if (!logContent.includes('SMART_AGENT_RESULT_FOUND')) throw new Error("Missing FOUND marker");
    
    if (zipMode === 'off') {
        const zipFile = path.join(resultDir, `bundle_${taskId}.zip`);
        if (fs.existsSync(zipFile)) throw new Error("Zip file created despite zip=off");
    }
    
    log(`Case ${caseName} PASSED.`);
    
    // Cleanup
    try { fs.unlinkSync(taskFile); } catch(e) {}
    // Keep result dir for inspection? Or clean it?
    // fs.rmSync(resultDir, { recursive: true, force: true });
}

(async () => {
    try {
        fs.writeFileSync(LOG_FILE, '');
        await runCase('ZipOff', 'off');
        // await runCase('ZipOn', 'on'); // Optional
        log("All Tests PASSED");
        process.exit(0);
    } catch (e) {
        log(`FAILED: ${e.message}`);
        process.exit(1);
    }
})();
