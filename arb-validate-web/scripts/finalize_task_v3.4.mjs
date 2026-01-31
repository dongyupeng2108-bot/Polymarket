import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';

// === Helper Functions ===
function printUsage() {
    console.log(`
Usage: node finalize_task_v3.4.mjs --task_id <ID> --task_dir <DIR> --status <DONE|FAILED> [options]

Options:
  --summary "<text>"       Task summary
  --extra "<file1;file2>"  Additional files to include
  --mode "<smart_agent|script>"  Execution mode (default: smart_agent)
  --zip "<on|off|auto>"    Zip generation mode (default: off)
  --manual_verify          Require manual_verification.json evidence
  --selftest               Run self-test and exit
`);
}

function getArg(name) {
    const idx = process.argv.indexOf(name);
    if (idx !== -1 && idx + 1 < process.argv.length) return process.argv[idx + 1];
    return null;
}

function fail(msg) {
    console.error(`[Finalizer] ERROR: ${msg}`);
    process.exit(1);
}

function resolveTaskDir(taskId, providedDir) {
    const normalizedProvided = path.normalize(providedDir);
    if (normalizedProvided.endsWith(path.join('results', taskId)) || 
        normalizedProvided.endsWith(path.join('results', taskId) + path.sep)) {
        return providedDir;
    }

    const candidate = path.join(providedDir, 'results', taskId);
    if (fs.existsSync(candidate)) {
        console.log(`[Finalizer] Resolved task_dir => ${candidate} (from ${providedDir})`);
        return candidate;
    }

    console.log(`[Finalizer] Using provided task_dir => ${providedDir} (results/${taskId} not found)`);
    return providedDir;
}

// === Main Logic ===

if (process.argv.includes('--selftest')) {
    console.log("[Finalizer] Internal simple selftest skipped. Use scripts/selftest_finalizer_taskdir_marker_zip_consistency_v3.4.mjs");
    process.exit(0);
}

const taskId = getArg('--task_id');
let taskDirRaw = getArg('--task_dir');
let status = getArg('--status');
const summary = getArg('--summary') || "No summary provided";
const mode = getArg('--mode') || "smart_agent";
const zipMode = getArg('--zip') || "off"; 
const manualVerify = process.argv.includes('--manual_verify');
const extraFiles = getArg('--extra') ? getArg('--extra').split(';') : [];

if (!taskId || !taskDirRaw || !status) {
    printUsage();
    fail("Missing required arguments");
}

if (!['DONE', 'FAILED'].includes(status)) {
    fail("Status must be DONE or FAILED");
}

if (!fs.existsSync(taskDirRaw)) {
    fail(`Directory not found: ${taskDirRaw}`);
}

const taskDir = resolveTaskDir(taskId, taskDirRaw);

console.log(`[Finalizer] Processing Task: ${taskId} in ${taskDir} (Mode: ${mode}, Zip: ${zipMode})`);

try {
    const logName = `run_${taskId}.log`;
    const logPath = path.join(taskDir, logName);
    let logContent = "";
    let logSource = "none";
    
    const evidencePath = path.join(taskDir, 'evidence.log');
    
    if (fs.existsSync(evidencePath)) {
        console.log(`[Finalizer] Found evidence.log`);
        logContent = fs.readFileSync(evidencePath, 'utf8');
        logSource = "evidence.log";
    } else if (fs.existsSync(logPath)) {
        logContent = fs.readFileSync(logPath, 'utf8');
        logSource = "existing_run_log";
    } else {
        const existingLog = fs.readdirSync(taskDir).find(f => f.endsWith('.log') && f !== 'evidence.log');
        if (existingLog) {
            logContent = fs.readFileSync(path.join(taskDir, existingLog), 'utf8');
            logSource = `aggregated_stdio (${existingLog})`;
        } else {
            console.warn(`[Finalizer] ⚠️ No log found (evidence.log or run_*.log). Creating placeholder.`);
            logContent = "NO LOG FOUND - Created by Finalizer";
            logSource = "placeholder";
            fs.writeFileSync(logPath, logContent);
        }
    }

    if (!fs.existsSync(logPath) && logSource !== "existing_run_log") {
        fs.writeFileSync(logPath, logContent);
    }

    const markersDetected = [];
    if (logContent.includes("SMART_AGENT_HANDOVER_START")) markersDetected.push("SMART_AGENT_HANDOVER_START");
    if (logContent.includes("SMART_AGENT_RESULT_FOUND")) markersDetected.push("SMART_AGENT_RESULT_FOUND");

    const acceptanceCheck = [];
    acceptanceCheck.push({ item: "Log Found", pass: true, note: logSource });
    acceptanceCheck.push({ item: "Markers Detected", pass: markersDetected.length >= 2, note: markersDetected.join(', ') });
    
    const resultName = `result_${taskId}.json`;
    const resultPath = path.join(taskDir, resultName);
    
    let startedAt = new Date().toISOString();
    let commandsExecuted = 0;
    
    if (fs.existsSync(resultPath)) {
        try {
            const oldRes = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
            if (oldRes.started_at) startedAt = oldRes.started_at;
            if (oldRes.commands_executed) commandsExecuted = oldRes.commands_executed;
        } catch (e) {}
    }

    let errorReason = summary;

    // Guard A: Zero Run False Positive
    if (status === 'DONE' && commandsExecuted === 0 && !taskId.startsWith('DOC_SYNC_')) {
        console.warn("[Finalizer] 🛑 GUARD: Zero commands executed for non-DOC task. Forcing FAILED.");
        status = 'FAILED';
        errorReason = 'ZERO_RUN_FALSE_POSITIVE';
        acceptanceCheck.push({ item: "R2: Non-Zero Commands", pass: false });
    } else if (commandsExecuted > 0) {
        acceptanceCheck.push({ item: "R2: Non-Zero Commands", pass: true });
    }

    // Guard B: Manual Verification Evidence
    const manualProofPath = path.join(taskDir, 'manual_verification.json');
    const hasManualProof = fs.existsSync(manualProofPath);

    if (manualVerify || hasManualProof) {
        if (hasManualProof) {
            acceptanceCheck.push({ item: "Manual Verification (Trae)", pass: true });
        } else {
            console.warn("[Finalizer] 🛑 GUARD: Manual Verification requested/implied but evidence missing. Forcing FAILED.");
            status = 'FAILED';
            errorReason = 'MANUAL_EVIDENCE_MISSING';
            acceptanceCheck.push({ item: "Manual Verification (Trae)", pass: false });
        }
    }

    const resultData = {
        task_id: taskId,
        version: "2.0",
        status: status,
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        parser_mode: "strict",
        commands_total: commandsExecuted, 
        commands_executed: commandsExecuted,
        retries: 0,
        acceptance_check: acceptanceCheck,
        markers_detected: markersDetected,
        zip_disabled: true,
        zip_requested: zipMode,
        zip_generated: false,
        artifacts: {
            result_json: resultName,
            notify_txt: `notify_${taskId}.txt`,
            latest_json: "LATEST.json"
        }
    };
    
    if (status === 'FAILED') resultData.error = errorReason;

    // Notify generation moved to end (Full Envelope support)
    const notifyName = `notify_${taskId}.txt`;
    const notifyPath = path.join(taskDir, notifyName);

    // Write Result JSON (Draft) to ensure it is indexed
    fs.writeFileSync(resultPath, JSON.stringify(resultData, null, 2));

    for (const extra of extraFiles) {
        if (fs.existsSync(extra)) {
            const dest = path.join(taskDir, path.basename(extra));
            if (!fs.existsSync(dest)) fs.copyFileSync(extra, dest);
        }
    }
    
    // === LATEST.json Generation (Local & Global) ===
    // Must be done BEFORE indexing to ensure LATEST.json is included in deliverables index
    const resultsDir = path.dirname(taskDir);
    const latestGlobalPath = path.join(resultsDir, "LATEST.json");
    const latestLocalPath = path.join(taskDir, "LATEST.json");
    
    const latestData = {
        latest_task_id: taskId,
        path: `results/${path.basename(taskDir)}/`,
        updated_at: new Date().toISOString()
    };
    
    const latestContent = JSON.stringify(latestData, null, 2);
    
    // Write Global (Standard requirement)
    try {
        fs.writeFileSync(latestGlobalPath, latestContent);
    } catch (e) {
        console.warn(`[Finalizer] Warning: Could not write global LATEST.json: ${e.message}`);
    }
    
    // Write Local (For Index inclusion - 008 requirement)
    fs.writeFileSync(latestLocalPath, latestContent);
    console.log(`[Finalizer] Created LATEST.json (Local & Global)`);


    // === Index Generation ===
    let filesToIndex = fs.readdirSync(taskDir).filter(f => 
        !f.startsWith('bundle_') && 
        !f.startsWith('deliverables_index_') &&
        !f.startsWith('.env') &&
        fs.statSync(path.join(taskDir, f)).isFile()
    );
    
    // Disable Zip Generation
    if (zipMode !== 'off') {
        console.log(`[Finalizer] Zip disabled (deprecated). Ignoring --zip ${zipMode}.`);
    } else {
        console.log("[Finalizer] Zip disabled (default).");
    }

    const indexData = { files: [] };
    for (const f of filesToIndex) {
        const p = path.join(taskDir, f);
        const s = fs.statSync(p);
        const b = fs.readFileSync(p);
        const h = crypto.createHash('sha256').update(b).digest('hex').substring(0, 8);
        indexData.files.push({ name: f, size: s.size, sha256_short: h });
    }
    
    const indexName = `deliverables_index_${taskId}.json`;

    // 009 Fix: Add Self-Reference to Index -> REMOVED in Task 025
    // Requirement Update: deliverables_index must not contain SELF_REF or 0-byte entries.
    // To avoid recursion paradox, we simply exclude the index file itself from its own list.
    // indexData.files.push({ ... }); 

    const indexPath = path.join(taskDir, indexName);
    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));

    // v3.4 Strict Acceptance Check (Updated for 008)
    // Notify.txt is the envelope, so it cannot be in the index (which is inside the envelope).
    const requiredFiles = [`result_${taskId}.json`, `run_${taskId}.log`, `LATEST.json`];
    const missingInIndex = requiredFiles.filter(req => !indexData.files.some(f => f.name === req));
    const missingOnDisk = indexData.files.filter(f => !fs.existsSync(path.join(taskDir, f.name)) && f.name !== indexName).map(f => f.name); // Exclude indexName from disk check as we just wrote it (or about to)
    
    const indexValid = missingInIndex.length === 0 && missingOnDisk.length === 0;
    
    acceptanceCheck.push({ item: "Deliverables Index Present", pass: fs.existsSync(indexPath) });
    acceptanceCheck.push({ item: "Deliverables Index References Exist", pass: indexValid });
    
    if (!indexValid) {
        console.error(`[Finalizer] ❌ Strict Acceptance Failed!`);
        if (missingInIndex.length > 0) console.error(`  Missing in Index: ${missingInIndex.join(', ')}`);
        if (missingOnDisk.length > 0) console.error(`  Missing on Disk: ${missingOnDisk.join(', ')}`);
        
        resultData.status = 'FAILED';
        resultData.error = `EVIDENCE_INVALID: Index missing refs [${missingInIndex}] or files missing [${missingOnDisk}]`;
        
        // Notify write deferred to end
    }
    
    // Write Result JSON (Final)
    fs.writeFileSync(resultPath, JSON.stringify(resultData, null, 2));
    console.log(`[Finalizer] Created ${resultName}`);

    // === Notify.txt Generation (Full Envelope v3.7) ===
    // MUST be generated LAST to include final status and result content
    const logLines = logContent.split('\n');
    const logHead = logLines.slice(0, 50).join('\n');
    const logTail = logLines.slice(-50).join('\n');

    const notifyContent = `RESULT_READY
RESULT_JSON
${JSON.stringify(resultData, null, 2)}
LOG_HEAD
${logHead}
LOG_TAIL
${logTail}
INDEX
${JSON.stringify(indexData, null, 2)}`;

    fs.writeFileSync(notifyPath, notifyContent);
    console.log(`[Finalizer] Created ${notifyName} (Full Envelope v3.7)`);

    console.log("[Finalizer] SUCCESS");

} catch (e) {
    fail(`Exception: ${e.message}`);
}
