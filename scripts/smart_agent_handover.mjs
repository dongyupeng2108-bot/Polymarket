
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRAEBACK_ROOT = path.resolve(__dirname, '../../Github/traeback');
const RUNNING_DIR = path.join(TRAEBACK_ROOT, 'running');
const RESULTS_DIR = path.join(TRAEBACK_ROOT, 'results');
const FINALIZER_SCRIPT = path.join(__dirname, 'finalize_task_v3.4.mjs');

// Parse args
console.log('[Handover] Process Argv:', JSON.stringify(process.argv));
const args = process.argv.slice(2);
console.log('[Handover] Sliced Args:', JSON.stringify(args));

const zipArgIndex = args.indexOf('--zip');
const zipMode = zipArgIndex !== -1 ? args[zipArgIndex + 1] : 'off'; 
const taskIdIndex = args.indexOf('--task_id');
const explicitTaskId = taskIdIndex !== -1 ? args[taskIdIndex + 1] : null;

console.log(`[Handover] Searching for running task in ${RUNNING_DIR}...`);

try {
    if (!fs.existsSync(RUNNING_DIR)) {
        throw new Error(`Running directory not found: ${RUNNING_DIR}`);
    }

    let taskId = explicitTaskId;

    if (!taskId) {
        const files = fs.readdirSync(RUNNING_DIR).filter(f => f.endsWith('.txt') || f.endsWith('.md'));
        
        if (files.length === 0) {
            throw new Error("No running task found in 'running/' directory.");
        }
        
        // Default to first found if no ID provided (legacy behavior)
        // But to be safer, maybe we should look for the most recent one?
        // For now, keep simple.
        const taskFile = files[0];
        const taskPath = path.join(RUNNING_DIR, taskFile);
        const content = fs.readFileSync(taskPath, 'utf8');
        
        // Extract Task ID
        const lines = content.split(/\r?\n/);
        const firstNonEmpty = lines.find(l => l.trim().length > 0);
        if (firstNonEmpty) {
            const match = firstNonEmpty.trim().match(/^task_id:\s*(.+)/i);
            if (match) taskId = match[1].trim();
        }
        
        if (!taskId) {
            const match = content.match(/task_id:\s*(.+)/i);
            if (match) taskId = match[1].trim();
        }

        if (!taskId) {
            throw new Error(`Could not extract task_id from ${taskFile}`);
        }
    }

    console.log(`[Handover] Detected Task ID: ${taskId}`);
    
    const taskDir = path.join(RESULTS_DIR, taskId);
    if (!fs.existsSync(taskDir)) {
        console.log(`[Handover] Creating results directory: ${taskDir}`);
        fs.mkdirSync(taskDir, { recursive: true });
    }

    // Prepare Log with Markers
    const logPath = path.join(taskDir, `run_${taskId}.log`);
    if (!fs.existsSync(logPath)) {
        console.log(`[Handover] Initializing log file...`);
        const marker = `[${new Date().toISOString()}] SMART_AGENT_HANDOVER_START`;
        fs.writeFileSync(logPath, marker + '\n');
        console.log(marker);
    } else {
        const logContent = fs.readFileSync(logPath, 'utf8');
        if (!logContent.includes('SMART_AGENT_HANDOVER_START')) {
            const marker = `[${new Date().toISOString()}] SMART_AGENT_HANDOVER_START`;
            fs.appendFileSync(logPath, marker + '\n');
            console.log(marker);
        }
    }

    // WAIT for agent_done.json
    const doneFlag = path.join(taskDir, 'agent_done.json');
    console.log(`[Handover] Waiting for signal: ${doneFlag}`);
    console.log(`[Handover] (Smart Agent should write this file when done)`);

    const timeout = 60 * 60 * 1000; // 60 minutes
    const startWait = Date.now();
    
    while (true) {
        if (fs.existsSync(doneFlag)) {
            console.log(`[Handover] Signal received: agent_done.json found.`);
            break;
        }
        
        if (Date.now() - startWait > timeout) {
            throw new Error("Timeout waiting for agent_done.json");
        }
        
        // Sleep 5s (Synchronous sleep to avoid CPU spin, but in Node we loop with Date)
        const stop = Date.now() + 5000;
        while (Date.now() < stop) {} 
    }

    // Append result found marker
    const resultMarker = `[${new Date().toISOString()}] SMART_AGENT_RESULT_FOUND`;
    fs.appendFileSync(logPath, resultMarker + '\n');
    console.log(resultMarker);
    console.log(`[Handover] Written SMART_AGENT_RESULT_FOUND marker.`);

    // Run Finalizer
    console.log(`[Handover] Triggering Finalizer v3.4...`);
    const finalizerCmd = `node "${FINALIZER_SCRIPT}" --task_id "${taskId}" --task_dir "${taskDir}" --status DONE --mode smart_agent --summary "Handover executed via smart_agent_handover.mjs" --zip ${zipMode}`;
    
    execSync(finalizerCmd, { stdio: 'inherit' });
    
    console.log(`[Handover] Complete.`);

} catch (e) {
    console.error(`[Handover] ERROR: ${e.message}`);
    process.exit(1);
}
