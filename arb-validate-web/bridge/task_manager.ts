
import fs from 'fs';
import path from 'path';
import { exec, spawn, execSync } from 'child_process';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const ROOT_INPUT = process.env.TM_ROOT_INPUT || 'E:\\polymaket\\program\\Github\\ChatGPT task';
const ROOT_TRAEBACK = process.env.TM_ROOT_TRAEBACK || 'E:\\polymaket\\program\\Github\\traeback';
const AUTO_RECEIPT = process.env.AUTO_RECEIPT === '1'; // Default: 0 (Manual only)

const DIRS = {
    input: ROOT_INPUT,
    inbox: path.join(ROOT_TRAEBACK, 'inbox'),
    running: path.join(ROOT_TRAEBACK, 'running'),
    done: path.join(ROOT_TRAEBACK, 'done'),
    failed: path.join(ROOT_TRAEBACK, 'failed'),
    results: path.join(ROOT_TRAEBACK, 'results'),
    deferred: path.join(ROOT_TRAEBACK, 'deferred'),
    postflight_failed: path.join(ROOT_TRAEBACK, 'postflight_failed'),
};

const POLLING_INTERVAL_MS = 10000;
const SMART_AGENT_WAIT_BATCH = 5 * 60 * 1000; // 5 minutes yield
const SMART_AGENT_MAX_WAIT = 24 * 60 * 60 * 1000; // 24 hours total
const SENDER_SCRIPT = path.join(__dirname, 'sender.ts');

// --- Types ---
interface TaskConfig {
    taskId: string;
    runCmds: string[];
    stopConditions: string;
    rawContent: string;
    filename: string;
    originalPath: string;
    isSmartAgent?: boolean;
}

type CheckpointStatus = 'LOCKED' | 'EXECUTED' | 'ARTIFACTED' | 'NOTIFIED' | 'ARCHIVED';

interface Checkpoint {
    status: CheckpointStatus;
    taskId: string;
    attempt: number;
    last_error?: string;
    exit_code?: number;
    timestamp: string;
    start_time?: string;
    end_time?: string;
    commands_executed?: number;
    total_retries?: number;
    smart_agent_start?: string; // v3.8: Track Smart Agent wait time across deferrals
}

function loadCheckpoint(resultDir: string): Checkpoint | null {
    const cpPath = path.join(resultDir, 'checkpoint.json');
    if (fs.existsSync(cpPath)) {
        try {
            return JSON.parse(fs.readFileSync(cpPath, 'utf-8'));
        } catch (e) {
            console.error('[Manager] Failed to parse checkpoint:', e);
            return null;
        }
    }
    return null;
}

function saveCheckpoint(resultDir: string, data: Partial<Checkpoint>) {
    const cpPath = path.join(resultDir, 'checkpoint.json');
    let current: Checkpoint = {
        status: 'LOCKED',
        taskId: 'UNKNOWN',
        attempt: 0,
        timestamp: new Date().toISOString()
    };
    
    if (fs.existsSync(cpPath)) {
        try {
            current = JSON.parse(fs.readFileSync(cpPath, 'utf-8'));
        } catch {}
    }
    
    const updated = { ...current, ...data, timestamp: new Date().toISOString() };
    fs.writeFileSync(cpPath, JSON.stringify(updated, null, 2));
}

// --- Main Loop ---
async function main() {
    console.log(`[Manager] 🚀 Trae Task Manager v1.1 Started (Strict Mode)`);
    console.log(`[Manager] Monitoring: ${DIRS.input}`);
    
    // Ensure dirs exist (redundant check but safe)
    Object.values(DIRS).forEach(d => {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    });

    while (true) {
        try {
            await cycle();
        } catch (e) {
            console.error(`[Manager] 💥 Unexpected loop error:`, e);
        }
        await new Promise(r => setTimeout(r, POLLING_INTERVAL_MS));
    }
}

async function cycle() {
    // 1. Scan
    // Check for running tasks (exclude SelfTest files)
    const runningFiles = fs.readdirSync(DIRS.running).filter(f => 
        (f.startsWith('task_id_')) && 
        (f.endsWith('.txt') || f.endsWith('.md')) &&
        !f.includes('SelfTest')
    );
    if (runningFiles.length > 0) {
        // Resume execution? Or just move to failed because we crashed?
        // Since we don't have checkpointing, safest is to move to failed or retry.
        // Let's retry parsing/execution.
        const filename = runningFiles[0];
        const runningPath = path.join(DIRS.running, filename);
        console.log(`[Manager] 🔄 Resuming stuck task: ${filename}`);
        
        // Skip locking step, go straight to execute
        await processTask(filename, runningPath);
        return;
    }

    // 0. Clean Forbidden Files (TraeTask) - Strict Enforcement
    const forbiddenFiles = fs.readdirSync(DIRS.input).filter(f => f.startsWith('TraeTask'));
    for (const f of forbiddenFiles) {
        console.log(`[Manager] 🚫 Forbidden file detected: ${f}`);
        await failTaskImmediate(f, path.join(DIRS.input, f), "FORBIDDEN_PREFIX: 'TraeTask' prefix is strictly disabled. You must use 'task_id:'.");
        // Continue to clean all forbidden files before processing valid ones
    }

    const files = fs.readdirSync(DIRS.input).filter(f => (f.startsWith('task_id_')) && (f.endsWith('.txt') || f.endsWith('.md')));
    
    // 2. Check Input
    if (files.length > 0) {
        // Pick first
        const filename = files[0];
        const inputPath = path.join(DIRS.input, filename);
        
        console.log(`[Watcher] 🟢 DETECTED: ${filename}`);

        // [v3.9] Preflight Validation
        // Hard gate: If preflight fails, fail task immediately without moving to inbox.
        try {
            const PREFLIGHT_SCRIPT = path.join(__dirname, '../scripts/preflight_validate_task.mjs');
            execSync(`node "${PREFLIGHT_SCRIPT}" "${inputPath}"`, { stdio: 'pipe' });
        } catch (e: any) {
            console.error(`[Manager] 🛑 Preflight Validation Failed: ${filename}`);
            const errorOutput = e.stderr ? e.stderr.toString() : e.message;
            await failTaskImmediate(filename, inputPath, `PREFLIGHT_FAIL: ${errorOutput}`);
            return; // Skip cycle
        }

        console.log(`[Manager] 📥 Found task: ${filename}`);

        // 2. Lock & Move (Inbox -> Running)
        const inboxPath = path.join(DIRS.inbox, filename);
        const runningPath = path.join(DIRS.running, filename);
        
        // Move to inbox
        try {
            console.log(`[Watcher] 🔒 LOCKING: ${filename}`);
            fs.renameSync(inputPath, inboxPath);
        } catch (e) {
            console.error(`[Manager] Failed to move to inbox (maybe locked?):`, e);
            return;
        }

        // Move to running immediately
        try {
            console.log(`[Watcher] 🚚 MOVING to RUNNING: ${filename}`);
            fs.renameSync(inboxPath, runningPath);
        } catch (e) {
            console.error(`[Manager] Failed to move to running:`, e);
            try { fs.renameSync(inboxPath, inputPath); } catch (_) {}
            return;
        }

        console.log(`[Watcher] ✅ LOCKED & READY: ${filename}`);

        await processTask(filename, runningPath);
        return;
    }

    // 3. Check Deferred (Finally Check)
    // Only check deferred if input is empty (Priority: Running > Input > Deferred)
    const deferredFiles = fs.readdirSync(DIRS.deferred).filter(f => 
        (f.startsWith('task_id_')) && 
        (f.endsWith('.txt') || f.endsWith('.md'))
    );
    
    if (deferredFiles.length > 0) {
        // Sort by mtime (Oldest first) to ensure rotation
        // We need to map to full paths to get stats
        const filesWithStats = deferredFiles.map(f => ({
            name: f,
            mtime: fs.statSync(path.join(DIRS.deferred, f)).mtime.getTime()
        }));
        
        filesWithStats.sort((a, b) => a.mtime - b.mtime);
        
        // Pick oldest
        const filename = filesWithStats[0].name;
        
        console.log(`[Manager] 🔄 Retrying deferred task (Oldest): ${filename}`);
        const deferredPath = path.join(DIRS.deferred, filename);
        const runningPath = path.join(DIRS.running, filename);
        
        try {
            fs.renameSync(deferredPath, runningPath);
            await processTask(filename, runningPath);
        } catch (e) {
            console.error(`[Manager] Failed to move deferred to running:`, e);
        }
        return;
    }
}

async function processTask(filename: string, runningPath: string) {
    // 3. Parse & Execute
    const content = fs.readFileSync(runningPath, 'utf-8');
    let task: TaskConfig | null = null;
    
    try {
        task = parseTask(content, filename, runningPath);
    } catch (e: any) {
        console.error(`[Manager] ❌ Invalid task file format: ${e.message}`);
        
        // v2.0 Requirement: Even if parsing fails, we must generate artifacts and notify
        // Create a dummy FAILED task config to support artifact generation
        const dummyTaskId = (filename.match(/(?:TraeTask_|TASK_ID_|task_id_)\s*(.+?)\.(txt|md)/)?.[1] || `INVALID_${Date.now()}`).trim();
        const dummyResultDir = path.join(DIRS.results, dummyTaskId);
        if (!fs.existsSync(dummyResultDir)) {
             fs.mkdirSync(dummyResultDir, { recursive: true });
        }
        
        // Generate FAILED result
        const dummyTask: TaskConfig = {
            taskId: dummyTaskId,
            runCmds: [],
            stopConditions: 'ON_FAILURE',
            rawContent: content,
            filename: filename,
            originalPath: runningPath
        };
        
        try {
            // Generate artifacts with error info
            const resultJson = {
                task_id: dummyTaskId,
                version: "2.0",
                status: "FAILED",
                started_at: new Date().toISOString(),
                ended_at: new Date().toISOString(),
                parser_mode: "strict",
                commands_total: 0,
                commands_executed: 0,
                retries: 0,
                error: `INVALID_TASK_FORMAT: ${e.message}`,
                acceptance_check: [
                    { item: "Valid Task Format", pass: false }
                ],
                artifacts: {
                    result_json: `result_${dummyTaskId}.json`,
                    notify_txt: `notify_${dummyTaskId}.txt`,
                    bundle_zip: `bundle_${dummyTaskId}.zip`,
                    latest_json: `LATEST.json`
                }
            };
            fs.writeFileSync(path.join(dummyResultDir, `result_${dummyTaskId}.json`), JSON.stringify(resultJson, null, 2));
            
            // Notify.txt
            const notifyContent = `RESULT_READY\ntask_id: ${dummyTaskId}\nstatus: FAILED\nlocal_path: ${dummyResultDir}\nerror: ${e.message}`;
            fs.writeFileSync(path.join(dummyResultDir, `notify_${dummyTaskId}.txt`), notifyContent);

            // Log
            fs.writeFileSync(path.join(dummyResultDir, `run_${dummyTaskId}.log`), `[Manager] ❌ Parsing Error: ${e.message}\n`);

            // Index & Bundle
            // We reuse generateArtifacts logic partially or just manually do it here to be safe
            // Let's call generateArtifacts but with success=false
            // But generateArtifacts expects valid task config.
            // Let's just do minimal bundling here.
            
            // Index
            const files = [`result_${dummyTaskId}.json`, `notify_${dummyTaskId}.txt`, `run_${dummyTaskId}.log`, filename];
            // Copy task file
            try { fs.copyFileSync(runningPath, path.join(dummyResultDir, filename)); } catch {}

            const indexData = { files: [] as any[] };
            files.forEach(f => {
                const p = path.join(dummyResultDir, f);
                if (fs.existsSync(p)) {
                    const s = fs.statSync(p);
                    const b = fs.readFileSync(p);
                    const h = crypto.createHash('sha256').update(b).digest('hex').substring(0, 8);
                    indexData.files.push({ name: f, size: s.size, sha256_short: h });
                }
            });
            fs.writeFileSync(path.join(dummyResultDir, `deliverables_index_${dummyTaskId}.json`), JSON.stringify(indexData, null, 2));
            files.push(`deliverables_index_${dummyTaskId}.json`);

            // Zip
            const zipPath = path.join(dummyResultDir, `bundle_${dummyTaskId}.zip`);
            const zip = new AdmZip();
            files.forEach(f => {
                const p = path.join(dummyResultDir, f);
                if (fs.existsSync(p)) zip.addLocalFile(p);
            });
            zip.writeZip(zipPath);
            
            // LATEST.json
            const latestJson = { latest_task_id: dummyTaskId, path: `results/${dummyTaskId}/` };
            fs.writeFileSync(path.join(DIRS.results, 'LATEST.json'), JSON.stringify(latestJson, null, 2));
            
            // Trigger Notify (Auto-Send)
            notifyResult(dummyTask, dummyResultDir, false, false).catch(err => console.error(err));

        } catch (err) {
            console.error(`[Manager] Failed to generate failure artifacts:`, err);
        }

        moveFile(runningPath, path.join(DIRS.failed, filename));
        return;
    }
    
    if (!task) {
        console.error(`[Manager] ❌ Invalid task file format (Unknown error).`);
        moveFile(runningPath, path.join(DIRS.failed, filename));
        return;
    }

    // Prepare Result Dir
    const resultDir = path.join(DIRS.results, task.taskId);
    if (!fs.existsSync(resultDir)) {
        fs.mkdirSync(resultDir, { recursive: true });
        saveCheckpoint(resultDir, { status: 'LOCKED', taskId: task.taskId, attempt: 1, start_time: new Date().toISOString() });

        // Watcher Logging (Backfill events)
        const watcherLogPath = path.join(resultDir, `run_${task.taskId}.log`);
        const watcherLog = `[Watcher] 🟢 Task Detected: ${filename}\n[Watcher] 🔒 Locked at ${new Date().toISOString()}\n[Watcher] 🚚 Moved to Running\n[Watcher] 📂 Result Dir: ${resultDir}\n`;
        try { fs.writeFileSync(watcherLogPath, watcherLog); } catch {}

    } else {
        // Existing dir? Maybe resuming?
        const cp = loadCheckpoint(resultDir);
        if (cp) {
            console.log(`[Manager] 🔄 Checkpoint found: ${cp.status} (Attempt ${cp.attempt})`);
            // Increment attempt if we are resuming from a crash/restart
            saveCheckpoint(resultDir, { attempt: cp.attempt + 1 });
        } else {
            // Fresh start overwriting old run? Or just overwrite?
            // If no checkpoint, treat as fresh
             console.warn(`[Manager] ⚠️ Result dir exists but no checkpoint, overwriting: ${resultDir}`);
             fs.rmSync(resultDir, { recursive: true, force: true });
             fs.mkdirSync(resultDir, { recursive: true });
             saveCheckpoint(resultDir, { status: 'LOCKED', taskId: task.taskId, attempt: 1, start_time: new Date().toISOString() });

             // Watcher Logging (Backfill events)
             const watcherLogPath = path.join(resultDir, `run_${task.taskId}.log`);
             const watcherLog = `[Watcher] 🟢 Task Detected: ${filename}\n[Watcher] 🔒 Locked at ${new Date().toISOString()}\n[Watcher] 🚚 Moved to Running\n[Watcher] 📂 Result Dir: ${resultDir}\n`;
             try { fs.writeFileSync(watcherLogPath, watcherLog); } catch {}
        }
    }

    // Execute
    let success = false;
    let overallExitCode = 1;
    const cp = loadCheckpoint(resultDir)!;

    console.log(`[Watcher] 🚀 STARTED: ${task.taskId}`);

    // STEP 1: EXECUTE
    if (cp.status === 'LOCKED') {
        try {
            let result;
            if (task.isSmartAgent) {
                result = await runSmartAgentHandover(task, resultDir);
                if (result.status === 'DEFERRED') {
                     console.log(`[Manager] ⏳ Task Deferred (Timeout). Moving to deferred queue.`);
                     saveCheckpoint(resultDir, { status: 'LOCKED', attempt: cp.attempt }); // Keep LOCKED
                     try {
                         fs.renameSync(runningPath, path.join(DIRS.deferred, filename));
                     } catch (e) {
                         console.error(`[Manager] Failed to move to deferred:`, e);
                     }
                     return;
                }
            } else {
                result = await runCommands(task, resultDir);
            }
            
            success = result.success;
            saveCheckpoint(resultDir, {
                status: 'EXECUTED',
                exit_code: success ? 0 : 1,
                commands_executed: result.executed,
                total_retries: result.retries,
                end_time: new Date().toISOString()
            });
        } catch (e) {
            console.error(`[Manager] ❌ Execution Exception:`, e);
            success = false;
            saveCheckpoint(resultDir, {
                status: 'EXECUTED',
                exit_code: 1,
                commands_executed: 0,
                total_retries: 0,
                end_time: new Date().toISOString()
            });
        }
    } else if (cp.status === 'EXECUTED' && cp.exit_code !== undefined) {
             console.log(`[Manager] ⏩ Skipping execution (Checkpoint: Exit Code ${cp.exit_code})`);
             overallExitCode = cp.exit_code;
             success = (overallExitCode === 0);
        } else {
             // Should not happen if status is EXECUTED, but safety fallback
             console.warn(`[Manager] ⚠️ Checkpoint says ${cp.status} but no exit_code. Treating as failed.`);
             success = false;
             overallExitCode = 1;
        }

    // STEP 2: ARTIFACTS
    const cp2 = loadCheckpoint(resultDir)!;
    if (cp2.status === 'EXECUTED') {
        // v3.9 Receipt Lock Check
        if (fs.existsSync(path.join(resultDir, 'RECEIPT.WRITTEN'))) {
             console.log(`[Watcher] 🛑 Receipt Lock Detected (RECEIPT.WRITTEN). Skipping generation.`);
             saveCheckpoint(resultDir, { status: 'ARTIFACTED' });
        } else {
            try {
                const startTime = cp2.start_time || new Date().toISOString();
                const endTime = cp2.end_time || new Date().toISOString();
                const executed = cp2.commands_executed || 0;
                const retries = cp2.total_retries || 0;
                generateArtifacts(task, resultDir, success, startTime, endTime, executed, retries);
                saveCheckpoint(resultDir, { status: 'ARTIFACTED' });
             } catch (e) {
                  console.error(`[Manager] ❌ Artifact generation failed:`, e);
                  // Check attempts
                  if (cp2.attempt >= 3) {
                      console.error(`[Manager] 🛑 Max attempts reached for artifact generation. Marking as FAILED.`);
                      moveFile(runningPath, path.join(DIRS.failed, filename));
                      return; // Stop cycle for this task
                  }
                  throw e; // Rethrow to trigger retry in next cycle
             }
        }
    } else if (cp2.status === 'ARTIFACTED' || cp2.status === 'NOTIFIED') {
        console.log(`[Manager] ⏩ Skipping artifacts (Checkpoint: ${cp2.status})`);
    }

    // STEP 2.5: POSTFLIGHT GATE (v1.1)
    const cpPost = loadCheckpoint(resultDir)!;
    if (cpPost.status === 'ARTIFACTED') {
        const POSTFLIGHT_SCRIPT = path.join(__dirname, '../scripts/postflight_validate_envelope.mjs');
        try {
            console.log(`[Manager] 🔍 Running Postflight Gate: ${task.taskId}`);
            execSync(`node "${POSTFLIGHT_SCRIPT}" --task_id "${task.taskId}" --result_dir "${resultDir}"`, { stdio: 'inherit' });
            // PASS
        } catch (e) {
            console.error(`[Manager] 🛑 Postflight Gate Failed! Initiating Protocol...`);
            
            // 1. Analyze Failure
            const reportPath = path.join(ROOT_TRAEBACK, 'reports', 'postflight', `${task.taskId}.json`);
            let reportData: any = {};
            try { reportData = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch {}
            const errors = reportData.errors || [{ code: 'UNKNOWN', message: 'Unknown Error' }];

            // 2. Analyze Strike Level
            const attemptMatch = task.rawContent.match(/attempt_no:\s*(\d+)/);
            const currentAttempt = attemptMatch ? parseInt(attemptMatch[1]) : 0;
            const parentId = (task.rawContent.match(/parent_task_id:\s*(.+)/)?.[1] || task.taskId).trim();

            if (currentAttempt >= 1) {
                 // STRIKE 2: ESCALATION
                 console.log(`[Manager] 🚨 Two-Strike Escalation for ${task.taskId}`);
                 const escalationDir = path.join(ROOT_TRAEBACK, 'reports', 'escalations');
                 if (!fs.existsSync(escalationDir)) fs.mkdirSync(escalationDir, { recursive: true });
                 
                 const escalationData = {
                     task_id: task.taskId,
                     parent_task_id: parentId,
                     strike: 2,
                     errors: errors,
                     timestamp: new Date().toISOString()
                 };
                 fs.writeFileSync(path.join(escalationDir, `${task.taskId}.json`), JSON.stringify(escalationData, null, 2));
                 
                 // Append to notify
                 const notifyPath = path.join(resultDir, `notify_${task.taskId}.txt`);
                 if (fs.existsSync(notifyPath)) {
                     fs.appendFileSync(notifyPath, `\n[ESCALATION] two_strike=true\nSTATUS: BLOCKED_BY_BOSS\nREASON: ${JSON.stringify(errors)}`);
                 }
                 
            } else {
                 // STRIKE 1: REWORK GENERATION
                 console.log(`[Manager] 🛠️ Generating Rework Task for ${task.taskId}`);
                 const reworkTaskId = `${task.taskId}_REWORK_1`;
                 const errorSummary = errors.map((e: any) => `${e.code}: ${e.message}`).join('; ');
                 
                 const reworkContent = `task_id: ${reworkTaskId}
milestone: ${task.rawContent.match(/milestone:\s*(.+)/)?.[1] || 'UNKNOWN'}
parent_task_id: ${task.taskId}
rework_reason: postflight_failed
attempt_no: 1
failed_items: [${errorSummary}]

CONTEXT:
This is an auto-generated rework task because the previous run failed the Postflight Gate.
You must fix the artifacts (notify.txt, logs, index) to meet the standard.
Do NOT add new features. Just fix the evidence.

RUN:
CMD: echo "Reworking artifacts..."

MODE=TASK CHECK: FIRSTLINE=task_id | NO_CODEBLOCK | HAS_MILESTONE+RUN | RUN_CMDS_OK | END_SENTINEL_OK | FAIL_FAST_OK
本次任务发布完毕。`;

                 const reworkPath = path.join(DIRS.input, `task_id_${reworkTaskId}.md`);
                 fs.writeFileSync(reworkPath, reworkContent);
            }

            // 3. Move original task file to postflight_failed
            moveFile(runningPath, path.join(DIRS.postflight_failed, filename));
            
            // 4. Mark checkpoint and Stop
            saveCheckpoint(resultDir, { status: 'POSTFLIGHT_FAILED' as any });
            return; 
        }
    }

    // STEP 3: NOTIFY
    const cp3 = loadCheckpoint(resultDir)!;
    if (cp3.status === 'ARTIFACTED') {
         // Enable Auto-Send based on AUTO_RECEIPT env var (Default: 0/False -> skipSend=true)
         await notifyResult(task, resultDir, success, !AUTO_RECEIPT);
         saveCheckpoint(resultDir, { status: 'NOTIFIED' });
    } else if (cp3.status === 'NOTIFIED') {
         console.log(`[Manager] ⏩ Skipping notification (Checkpoint: ${cp3.status})`);
    }

    const finalDir = success ? DIRS.done : DIRS.failed;
    moveFile(runningPath, path.join(finalDir, filename));
    
    console.log(`[Watcher] 🏁 FINISHED: ${task.taskId} (Success: ${success})`);
    console.log(`[Manager] 🏁 Task cycle complete. Status: ${success ? 'DONE' : 'FAILED'}`);
}

function extractRunCommands(content: string): string[] {
    const lines = content.split(/\r?\n/);
    const commands: string[] = [];
    let inRunBlock = false;
    let foundSentinel = false;

    for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('RUN:')) {
            inRunBlock = true;
            continue;
        }
        
        if (inRunBlock) {
            if (trimmed === '本次任务发布完毕。') {
                foundSentinel = true;
                break;
            }
            
            if (trimmed.startsWith('CMD:')) {
                commands.push(trimmed.substring(4).trim());
            } else if (trimmed.startsWith('- ')) {
                commands.push(trimmed.substring(2).trim());
            }
            // Ignore all other lines (Chinese, empty, comments)
        }
    }
    
    if (!inRunBlock) {
        throw new Error('MISSING_RUN_BLOCK');
    }
    if (!foundSentinel) {
        throw new Error('MISSING_SENTINEL');
    }
    
    if (commands.length === 0) {
        throw new Error('NO_VALID_COMMANDS_FOUND (Did you forget "CMD:" prefix?)');
    }

    return commands;
}

function parseTask(content: string, filename: string, filepath: string): TaskConfig | null {
    // v3.4 Strict Rule: task_id must be the first non-empty line
    // Fix: Remove BOM and handle leading whitespace
    const cleanContent = content.replace(/^\uFEFF/, '');
    const lines = cleanContent.split(/\r?\n/);
    const firstNonEmpty = lines.find(l => l.trim().length > 0);
    
    if (!firstNonEmpty) throw new Error('EMPTY_FILE');
    
    // Check if first non-empty line is TASK_ID
    const taskIdMatch = firstNonEmpty.trim().match(/^task_id:\s*(.+)/i);
    
    if (!taskIdMatch) {
        // Allow legacy fallback if filename has ID? 
        // v3.4 says "强制" (Mandatory). But to avoid breaking everything immediately, 
        // maybe we check if it's a "TraeTask_" file and allow loose parsing?
        // No, let's enforce it as requested for v3.4 compliance.
        throw new Error('INVALID_HEADER: First non-empty line must be "task_id: <ID>" (v3.4 Rule)');
    }

    const taskId = taskIdMatch[1].trim();
    const stopMatch = content.match(/STOP_CONDITIONS:\s*(.+)/i);

    const commands = extractRunCommands(content);
    
    // Detect Smart Agent Mode
    const isSmartAgent = content.includes('TYPE: SMART_AGENT') || 
                        content.includes('CMD: AGENT_SOLVE') ||
                        commands.includes('AGENT_SOLVE') ||
                        // Also check MODE section if present
                        (content.match(/MODE:\s*[\r\n]+(?:\s*-\s*smart_agent)/i) !== null);

    return {
        taskId: taskId,
        runCmds: commands,
        stopConditions: stopMatch ? stopMatch[1].trim() : '',
        rawContent: content,
        filename: filename,
        originalPath: filepath,
        isSmartAgent
    };
}

async function runCommands(task: TaskConfig, resultDir: string): Promise<{ success: boolean, executed: number, retries: number }> {
    console.log(`[Manager] ▶️ Executing ${task.runCmds.length} commands for Task ${task.taskId}`);
    const logPath = path.join(resultDir, `run_${task.taskId}.log`);
    let overallExitCode = 0;
    let executedCount = 0;
    let totalRetries = 0;

    // Stream to log file
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    
    try {
        for (const cmd of task.runCmds) {
            let retryCount = 0;
            const MAX_RETRIES = 3;
            let cmdSuccess = false;

            while (retryCount <= MAX_RETRIES && !cmdSuccess) {
                if (retryCount > 0) {
                    totalRetries++;
                    const retryMsg = `\n[Manager] 🔄 Retry ${retryCount}/${MAX_RETRIES} for command: ${cmd}\n`;
                    logStream.write(retryMsg);
                    console.log(retryMsg.trim());
                    // Wait a bit before retry (30s)
                    await new Promise(r => setTimeout(r, 30000)); 
                }

                const timestamp = new Date().toISOString();
                const cmdLog = `\n[${timestamp}] CMD_START: ${cmd}\n`;
                logStream.write(cmdLog);
                console.log(cmdLog.trim());

                let lastHeartbeat = Date.now();
                let heartbeatInterval: NodeJS.Timeout | null = null;

                await new Promise<void>((resolve) => {
                    // No fixed timeout, rely on heartbeat (20m)
                    const child = exec(cmd, { 
                        cwd: process.cwd(),
                        env: { ...process.env, RESULT_DIR: resultDir, TASK_ID: task.taskId }
                    });
                    
                    // Heartbeat monitor
                    heartbeatInterval = setInterval(() => {
                        const now = Date.now();
                        if (now - lastHeartbeat > 20 * 60 * 1000) { // 20 mins
                            const msg = `\n[Manager] 💔 Heartbeat timeout (20m). Killing process...\n`;
                            logStream.write(msg);
                            console.error(msg.trim());
                            try { 
                                if (child.pid) process.kill(child.pid); 
                            } catch(e) {}
                        }
                    }, 30000); // Check every 30s
                    
                    // Update heartbeat on output
                    child.stdout?.on('data', () => lastHeartbeat = Date.now());
                    child.stderr?.on('data', () => lastHeartbeat = Date.now());

                    child.stdout?.pipe(logStream, { end: false });
                    child.stderr?.pipe(logStream, { end: false });
                    
                    child.stdout?.pipe(process.stdout);
                    child.stderr?.pipe(process.stderr);

                    child.on('exit', (code, signal) => {
                        if (heartbeatInterval) clearInterval(heartbeatInterval);
                        if (code === 0) {
                            cmdSuccess = true;
                        } else {
                            // Failed or Killed
                            const msg = `\n[Manager] Command exited with code ${code} signal ${signal}\n`;
                            logStream.write(msg);
                        }
                        resolve();
                    });
                    
                    child.on('error', (err) => {
                        if (heartbeatInterval) clearInterval(heartbeatInterval);
                        logStream.write(`\n[Manager] Execution Error: ${err.message}\n`);
                        resolve();
                    });
                });

                if (cmdSuccess) break;
                retryCount++;
            }

            if (!cmdSuccess) {
                console.log(`[Manager] 🛑 Command failed after retries. Stopping execution.`);
                overallExitCode = 1;
                break; // Fail fast
            } else {
                executedCount++;
            }
        }
    } catch (e) {
        overallExitCode = 1;
    } finally {
        logStream.end();
        await new Promise(resolve => logStream.on('finish', resolve));
        logStream.close(); // Ensure it's closed
        logStream.destroy(); // Ensure it's destroyed
        // Wait a bit to ensure file lock is released
        await new Promise(r => setTimeout(r, 1000));
    }

    const overallSuccess = (overallExitCode === 0);
    console.log(`[Manager] Execution finished. Overall Code: ${overallExitCode}`);
    return { success: overallSuccess, executed: executedCount, retries: totalRetries };
}

async function runSmartAgentHandover(task: TaskConfig, resultDir: string): Promise<{ success: boolean, executed: number, retries: number, status?: string }> {
    console.log(`[Manager] 🧠 Smart Agent Mode Detected for Task ${task.taskId}`);
    const logPath = path.join(resultDir, `run_${task.taskId}.log`);
    
    // Check if resuming
    let isResuming = false;
    if (fs.existsSync(logPath)) {
        const logContent = fs.readFileSync(logPath, 'utf-8');
        if (logContent.includes('SMART_AGENT_HANDOVER_START')) {
            isResuming = true;
            console.log(`[Manager] 🧠 Resuming Smart Agent wait...`);
        }
    }
    
    if (!isResuming) {
        fs.writeFileSync(logPath, `[${new Date().toISOString()}] SMART_AGENT_HANDOVER_START\nWaiting for Gemini/Trae to produce result.json...\n`);
        
        // Alert User
        const alertMsg = `Trae Smart Agent Task ${task.taskId} Waiting for manual execution!`;
        console.log(`\n\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
        console.log(alertMsg);
        console.log(`ACTION REQUIRED: Run Finalizer manually (or ask Trae)`);
        console.log(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n\n`);
    }
    
    // Popup removed as per user request to avoid blocking execution


    // Polling Loop
    // Use Checkpoint for total time tracking
    const cp = loadCheckpoint(resultDir);
    const firstStartTime = cp?.smart_agent_start ? new Date(cp.smart_agent_start).getTime() : Date.now();
    
    if (!cp?.smart_agent_start) {
        saveCheckpoint(resultDir, { smart_agent_start: new Date().toISOString() });
    }

    const resultJsonPath = path.join(resultDir, `result_${task.taskId}.json`);
    const BATCH_START_TIME = Date.now();

    let waitIntervals = 0;
    while (Date.now() - BATCH_START_TIME < SMART_AGENT_WAIT_BATCH) {
        // Check Total Timeout
        if (Date.now() - firstStartTime > SMART_AGENT_MAX_WAIT) {
             console.error(`[Manager] ❌ Smart Agent Timeout (24h).`);
             fs.appendFileSync(logPath, `[${new Date().toISOString()}] SMART_AGENT_TIMEOUT\n`);
             return { success: false, executed: 0, retries: 0 };
        }
        if (fs.existsSync(resultJsonPath)) {
            try {
                const resContent = fs.readFileSync(resultJsonPath, 'utf-8');
                const res = JSON.parse(resContent);
                
                // [Fix] Fake Positive Detection: If DONE but executed=0, mark FAILED (Exempt DOC_SYNC tasks)
                if (res.status === 'DONE' && (!res.commands_executed || res.commands_executed === 0) && !task.taskId.startsWith('DOC_SYNC_')) {
                     console.warn(`[Manager] ⚠️ Detected Fake Positive DONE (executed=0). Marking as FAILED.`);
                     res.status = 'FAILED';
                     res.error = 'INVALID_TASK_EXECUTION: NO_COMMANDS_EXECUTED';
                     fs.writeFileSync(resultJsonPath, JSON.stringify(res, null, 2));
                     fs.appendFileSync(logPath, `[${new Date().toISOString()}] SMART_AGENT_INVALID_RESULT: executed=0\n`);
                     return { success: false, executed: 0, retries: 0 };
                }

                // [Fix] Manual Verification Evidence Check
                // If task explicitly requests manual verification, require manual_verification.json
                const requiresManualVerify = task.rawContent.includes('Manual Verification (Trae)=true') || task.rawContent.includes('Manual Verification (Trae): true');
                const manualProofPath = path.join(resultDir, 'manual_verification.json');
                
                if (res.status === 'DONE' && requiresManualVerify && !fs.existsSync(manualProofPath)) {
                     console.warn(`[Manager] ⚠️ Manual Verification Required but Evidence Missing. Marking as FAILED.`);
                     res.status = 'FAILED';
                     res.error = 'MANUAL_EVIDENCE_MISSING';
                     fs.writeFileSync(resultJsonPath, JSON.stringify(res, null, 2));
                     fs.appendFileSync(logPath, `[${new Date().toISOString()}] SMART_AGENT_INVALID_RESULT: Manual Evidence Missing\n`);
                     return { success: false, executed: res.commands_executed || 0, retries: 0 };
                }

                console.log(`[Manager] 🧠 Smart Agent Result Found! Resuming...`);
                fs.appendFileSync(logPath, `[${new Date().toISOString()}] SMART_AGENT_RESULT_FOUND\n`);
                return { success: res.status === 'DONE', executed: res.commands_executed || 0, retries: res.retries || 0 };
            } catch (e) {
                // Ignore parse errors (partial write), wait for next cycle
            }
        }
        await new Promise(r => setTimeout(r, 5000)); // Check every 5s
        waitIntervals++;
        if (waitIntervals % 12 === 0) { // Every 60s
             const totalElapsedMins = Math.floor((Date.now() - firstStartTime) / 60000);
             const batchElapsedMins = Math.floor((Date.now() - BATCH_START_TIME) / 60000);
             console.log(`[Manager] ⏳ Waiting for Smart Agent result... (Total: ${totalElapsedMins}m, Current Batch: ${batchElapsedMins}m / 5m)`);
        }
    }

    // Batch Timeout -> Defer
    console.log(`[Manager] ⏸️ Smart Agent Batch Timeout (${SMART_AGENT_WAIT_BATCH/60000}m). Deferring task to allow other tasks to run.`);
    return { success: false, executed: 0, retries: 0, status: 'DEFERRED' };
}

function generateArtifacts(task: TaskConfig, resultDir: string, isSuccess: boolean, startTime: string, endTime: string, executed: number, retries: number) {
    // [Smart Agent Check] If result.json exists and is valid (generated by finalize_task), skip generation
    // UNLESS verification failed (isSuccess=false) but result says DONE
    const preExistingResultPath = path.join(resultDir, `result_${task.taskId}.json`);
    if (fs.existsSync(preExistingResultPath)) {
        try {
            const preResult = JSON.parse(fs.readFileSync(preExistingResultPath, 'utf8'));
            if (preResult.status && preResult.artifacts) {
                if (!isSuccess && preResult.status === 'DONE') {
                    console.warn(`[Manager] ⚠️ Result says DONE but Manager Verification Failed. Regenerating artifacts...`);
                    // Fall through to regenerate
                } else {
                    console.log(`[Manager] 🧠 Smart Agent artifacts detected. Skipping generation.`);
                    return;
                }
            }
        } catch (e) {
            console.warn(`[Manager] Found invalid result.json, regenerating...`);
        }
    }

    const statusStr = isSuccess ? 'DONE' : 'FAILED';
    const logPath = path.join(resultDir, `run_${task.taskId}.log`);

    // 1. Result JSON
    const artifacts: any = {
        result_json: `result_${task.taskId}.json`,
        notify_txt: `notify_${task.taskId}.txt`,
        latest_json: `LATEST.json`
    };

    // [Fix] Only include bundle_zip if enabled via env var (Default: OFF)
    const shouldZip = process.env.ENABLE_ZIP === 'true';
    if (shouldZip) {
        artifacts.bundle_zip = `bundle_${task.taskId}.zip`;
    }

    // [Fix] R2 Violation Check: If status is DONE but commands_executed=0, force FAILED
    if (statusStr === 'DONE' && (executed === 0 || task.runCmds.length === 0)) {
        console.warn(`[Manager] 🛑 VIOLATION DETECTED: DONE status with 0 commands executed. Forcing FAILED.`);
        // Note: We cannot change the 'statusStr' const, so we modify the object property.
        // We also need to update notify.txt content.
        
        // This logic is tricky because we've already defined statusStr. 
        // Let's modify resultJson directly before writing.
    }

    const resultJson = {
        task_id: task.taskId,
        version: "2.0",
        status: (statusStr === 'DONE' && (executed === 0 || task.runCmds.length === 0)) ? 'FAILED' : statusStr,
        started_at: startTime,
        ended_at: endTime,
        parser_mode: "strict",
        commands_total: task.runCmds.length,
        commands_executed: executed,
        retries: retries,
        error: (statusStr === 'DONE' && (executed === 0 || task.runCmds.length === 0)) ? 'VIOLATION_R2_ZERO_COMMANDS_DONE' : undefined,
        acceptance_check: [
            { item: "Run Command Exit Code 0", pass: isSuccess },
            { item: "Artifacts Generated", pass: true },
            { item: "Deliverables Index Present", pass: true },
            { item: "Deliverables Index References Exist", pass: true }
        ],
        artifacts: artifacts
    };
    
    // If forced fail, ensure acceptance check reflects it
    if (resultJson.status === 'FAILED' && statusStr === 'DONE') {
         resultJson.acceptance_check.push({ item: "R2: Non-Zero Commands", pass: false });
    }

    const resultJsonPath = path.join(resultDir, `result_${task.taskId}.json`);
    fs.writeFileSync(resultJsonPath, JSON.stringify(resultJson, null, 2));

    // 2. Notify TXT
    const notifyContent = 
`RESULT_READY
task_id: ${task.taskId}
status: ${resultJson.status}
local_path: ${resultDir}`;
    const notifyPath = path.join(resultDir, `notify_${task.taskId}.txt`);
    fs.writeFileSync(notifyPath, notifyContent);

    // 3. Update LATEST.json in ROOT/results/ AND Local
    const latestJson = {
        latest_task_id: task.taskId,
        path: `results/${task.taskId}/`
    };
    fs.writeFileSync(path.join(DIRS.results, 'LATEST.json'), JSON.stringify(latestJson, null, 2));
    fs.writeFileSync(path.join(resultDir, 'LATEST.json'), JSON.stringify(latestJson, null, 2)); // Local copy for Index

    // 4. Deliverables Index
    const taskFileInResult = path.join(resultDir, task.filename);
    if (!fs.existsSync(taskFileInResult)) {
        try {
            // Sanity check: Ensure resultDir exists
            if (!fs.existsSync(resultDir)) fs.mkdirSync(resultDir, { recursive: true });

            // STRATEGY: Check RUNNING dir first (most likely), then ORIGINAL path
            const runningPath = path.join(DIRS.running, task.filename);
            
            if (fs.existsSync(runningPath)) {
                fs.copyFileSync(runningPath, taskFileInResult);
            } else if (fs.existsSync(task.originalPath)) {
                console.warn(`[Manager] ⚠️ Task file not in RUNNING, falling back to ORIGINAL: ${task.originalPath}`);
                fs.copyFileSync(task.originalPath, taskFileInResult);
            } else {
                console.error(`[Manager] ❌ Could not find task file to copy: ${task.filename}`);
            }
        } catch (e) {
            console.error(`[Manager] ❌ Failed to copy task file:`, e);
        }
    }

    const filesToZip = [
        task.filename,
        `result_${task.taskId}.json`,
        `notify_${task.taskId}.txt`,
        `run_${task.taskId}.log`,
        `LATEST.json`
    ];

    // Add healthcheck result if exists
    if (fs.existsSync(path.join(resultDir, `healthcheck_${task.taskId}.json`))) {
        filesToZip.push(`healthcheck_${task.taskId}.json`);
    }

    // Add manual_verification.json if exists
    if (fs.existsSync(path.join(resultDir, 'manual_verification.json'))) {
        filesToZip.push('manual_verification.json');
    }

    const indexData: any = { files: [] };
    const uniqueFiles = new Set<string>();

    let hasEmptyFile = false;

    filesToZip.forEach(f => {
        if (uniqueFiles.has(f)) return;
        uniqueFiles.add(f);

        const p = path.join(resultDir, f);
        if (fs.existsSync(p)) {
            const stats = fs.statSync(p);
            
            // v3.9 Rule: Flag empty files
            if (stats.size === 0) {
                 console.warn(`[Manager] ⚠️ Warning: Deliverable ${f} is 0 bytes!`);
                 hasEmptyFile = true;
                 indexData.files.push({ name: f, size: 0, sha256_short: 'EMPTY_FILE', error: 'EMPTY_FILE_FORBIDDEN' });
            } else {
                 const buf = fs.readFileSync(p);
                 const hash = crypto.createHash('sha256').update(buf).digest('hex').substring(0, 8);
                 indexData.files.push({ name: f, size: stats.size, sha256_short: hash });
            }
        }
    });

    // v3.9: If empty files found, force FAILED
    if (hasEmptyFile) {
        console.error(`[Manager] 🛑 Empty files detected! Forcing FAILED status.`);
        resultJson.status = 'FAILED';
        resultJson.error = 'EMPTY_FILE_DETECTED';
        resultJson.acceptance_check.push({ item: "No Empty Files", pass: false });
        fs.writeFileSync(resultJsonPath, JSON.stringify(resultJson, null, 2));
        
        // Rewrite Notify
        const notifyContent = 
`RESULT_READY
task_id: ${task.taskId}
status: FAILED
local_path: ${resultDir}
error: EMPTY_FILE_DETECTED`;
        const notifyPath = path.join(resultDir, `notify_${task.taskId}.txt`);
        fs.writeFileSync(notifyPath, notifyContent);
    }

    // v3.9: Explicitly ban SELF_REF. 
    // If we need to reference the index file itself, we must use a placeholder that doesn't break verification
    // OR just don't include it (preferred).
    
    // Write Deliverables Index
    const indexPath = path.join(resultDir, `deliverables_index_${task.taskId}.json`);
    fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
    
    // Write Receipt Lock
    const receiptLockPath = path.join(resultDir, 'RECEIPT.WRITTEN');
    fs.writeFileSync(receiptLockPath, new Date().toISOString());
    
    // 5. Bundle ZIP (Use adm-zip for reliability)
    if (shouldZip) {
        const zipPath = path.join(resultDir, `bundle_${task.taskId}.zip`);
        try {
            const zip = new AdmZip();
            for (const f of filesToZip) {
                const p = path.join(resultDir, f);
                if (fs.existsSync(p)) {
                    zip.addLocalFile(p);
                }
            }
            // Add index to zip
            if (fs.existsSync(indexPath)) {
                zip.addLocalFile(indexPath);
            }
            zip.writeZip(zipPath);
            console.log(`[Manager] 📦 Bundle created: ${path.basename(zipPath)}`);
        } catch (e) {
            console.error(`[Manager] ❌ Zip creation failed:`, e);
            throw e;
        }
    } else {
        console.log(`[Manager] ⏩ Bundle ZIP disabled (ENABLE_ZIP!=true). Skipping.`);
    }

    // 6. Generate v3.7 Payload (Auto-Sync Context) & Report
    try {
        const payloadPath = path.join(resultDir, `payload_${task.taskId}.txt`);
        const reportPath = path.join(resultDir, `report_for_chatgpt.txt`);
        
        const payloadContent = generateV37Payload(task, resultDir, resultJson);
        
        fs.writeFileSync(payloadPath, payloadContent);
        fs.writeFileSync(reportPath, payloadContent); // v3.9 Requirement
        // Also overwrite notify.txt for convenience
        fs.writeFileSync(notifyPath, payloadContent); 
        
        console.log(`[Manager] 📨 Report generated: ${path.basename(reportPath)}`);
    } catch (e: any) {
        console.error(`[Manager] ❌ Failed to generate payload/report:`, e);
    }
}

function generateV37Payload(task: TaskConfig, resultDir: string, resultJson: any): string {
    // 1. Logs
    const logPath = path.join(resultDir, `run_${task.taskId}.log`);
    let logHead = "";
    let logTail = "";
    if (fs.existsSync(logPath)) {
        const lines = fs.readFileSync(logPath, 'utf-8').split('\n');
        logHead = lines.slice(0, 60).join('\n');
        logTail = lines.slice(-200).join('\n');
    }

    // 2. Context Sync (Inject Progress & Rules)
    let contextSync = "\n\n=== PROJECT CONTEXT SYNC ===\n";
    try {
        // Hardcoded paths to project rules directory (e:\polymaket\program\rules)
        // Manager is in arb-validate-web/bridge, so we go up two levels to program, then to rules.
        // path.resolve(__dirname, '../../rules')
        
        const rulesDir = path.resolve(__dirname, '../../rules');
        const progPath = path.join(rulesDir, 'PROJECT_PROGRESS.md');
        const rulesPath = path.join(rulesDir, 'PROJECT_RULES.md');
        
        if (fs.existsSync(progPath)) {
            contextSync += `\n--- [PROJECT_PROGRESS.md] ---\n${fs.readFileSync(progPath, 'utf-8')}\n`;
        }
        if (fs.existsSync(rulesPath)) {
            contextSync += `\n--- [PROJECT_RULES.md] ---\n${fs.readFileSync(rulesPath, 'utf-8')}\n`;
        }
    } catch (e) {
        contextSync += `\n[Error Syncing Context: ${e}]\n`;
    }
    contextSync += "============================\n";
    
    // Append Context to Log Tail
    logTail += contextSync;

    // 3. Deliverables Index (No SELF_REF)
    let indexStr = "[]";
    const indexPath = path.join(resultDir, `deliverables_index_${task.taskId}.json`);
    if (fs.existsSync(indexPath)) {
        try {
            // Read as is
            indexStr = fs.readFileSync(indexPath, 'utf-8');
            
            // v3.9: STRICTLY NO SELF_REF INJECTION
            // The index on disk is the source of truth.
        } catch (e) {
            indexStr = `{"error": "Failed to parse index", "details": "${e}"}`;
        }
    }

    return `RESULT_READY
task_id: ${task.taskId}
status: ${resultJson.status}
local_path: ${resultDir}

---RESULT_JSON_START---
${JSON.stringify(resultJson, null, 2)}
---RESULT_JSON_END---

---LOG_HEAD_START---
${logHead}
---LOG_HEAD_END---

---LOG_TAIL_START---
${logTail}
---LOG_TAIL_END---

---INDEX_START---
${indexStr}
---INDEX_END---
`;
}

async function notifyResult(task: TaskConfig, resultDir: string, isSuccess: boolean, skipSend: boolean = true) {
    // 1. Check Receipt Lock (Single Receipt per Task)
    const receiptMarker = path.join(resultDir, 'RECEIPT_SENT.marker');
    if (fs.existsSync(receiptMarker)) {
        console.log(`[Manager] 🛑 Receipt already sent (Marker found). Skipping.`);
        return;
    }

    let finalSuccess = isSuccess;
    let statusStr = finalSuccess ? 'DONE' : 'FAILED';
    const logPath = path.join(resultDir, `run_${task.taskId}.log`);
    const notifyPath = path.join(resultDir, `notify_${task.taskId}.txt`);
    const indexPath = path.join(resultDir, `deliverables_index_${task.taskId}.json`);
    const resultJsonPath = path.join(resultDir, `result_${task.taskId}.json`);

    // --- v3.3 Evidence Validation ---
    const missingEvidence: string[] = [];
    if (!fs.existsSync(resultJsonPath)) missingEvidence.push('result.json');
    if (!fs.existsSync(logPath)) missingEvidence.push('run.log');
    if (!fs.existsSync(indexPath)) missingEvidence.push('deliverables_index.json');

    if (missingEvidence.length > 0) {
        console.error(`[Manager] ❌ Evidence Validation Failed! Missing: ${missingEvidence.join(', ')}`);
        finalSuccess = false;
        statusStr = 'FAILED';
        
        // Update/Create Result JSON with error
        let resJson: any = {};
        try {
            if (fs.existsSync(resultJsonPath)) {
                resJson = JSON.parse(fs.readFileSync(resultJsonPath, 'utf-8'));
            }
        } catch {}
        
        resJson.status = 'FAILED';
        resJson.error = `EVIDENCE_MISSING: ${missingEvidence.join(', ')}`;
        if (!resJson.acceptance_check) resJson.acceptance_check = [];
        resJson.acceptance_check.push({ item: "v3.3 Evidence Pack", pass: false });
        
        fs.writeFileSync(resultJsonPath, JSON.stringify(resJson, null, 2));

        // Update Notify TXT
        const notifyErr = `RESULT_READY\ntask_id: ${task.taskId}\nstatus: FAILED\nlocal_path: ${resultDir}\nerror: EVIDENCE_MISSING: ${missingEvidence.join(', ')}`;
        fs.writeFileSync(notifyPath, notifyErr);
    } else {
        // v3.7 Deliverables Index Deep Validation
        try {
            const indexContent = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
            const filesList = indexContent.files || [];
            
            // Rule: Index must be non-empty
            if (filesList.length === 0) {
                 throw new Error("Deliverables Index is empty (v3.7 Rule: Must contain files)");
            }

            // Rule: No SELF_REF placeholder (v3.7)
            const selfRef = filesList.find((f: any) => f.sha256_short === 'SELF_REF');
            if (selfRef) {
                throw new Error("Deliverables Index contains forbidden SELF_REF placeholder (v3.7 Rule)");
            }

            // 1. Check if core files are in index
            const requiredInIndex = [`result_${task.taskId}.json`, `run_${task.taskId}.log`, `notify_${task.taskId}.txt`];
            const missingInIndex = requiredInIndex.filter(req => !filesList.some((f: any) => f.name === req));
            
            // 2. Check if indexed files exist on disk
            const missingOnDisk = filesList.filter((f: any) => !fs.existsSync(path.join(resultDir, f.name))).map((f: any) => f.name);

            if (missingInIndex.length > 0 || missingOnDisk.length > 0) {
                console.error(`[Manager] ❌ Deliverables Index Verification Failed!`);
                if (missingInIndex.length > 0) console.error(`  Missing in Index: ${missingInIndex.join(', ')}`);
                if (missingOnDisk.length > 0) console.error(`  Missing on Disk: ${missingOnDisk.join(', ')}`);
                
                finalSuccess = false;
                statusStr = 'FAILED';
                
                 // Update Result JSON
                let resJson: any = {};
                try {
                    if (fs.existsSync(resultJsonPath)) resJson = JSON.parse(fs.readFileSync(resultJsonPath, 'utf-8'));
                } catch {}
                
                resJson.status = 'FAILED';
                resJson.error = `EVIDENCE_INVALID: Index missing refs [${missingInIndex}] or files missing [${missingOnDisk}]`;
                
                if (!resJson.acceptance_check) resJson.acceptance_check = [];
                resJson.acceptance_check.push({ item: "Deliverables Index Valid (v3.7)", pass: false });
                
                fs.writeFileSync(resultJsonPath, JSON.stringify(resJson, null, 2));
                
                // Update Notify TXT
                const notifyErr = `RESULT_READY\ntask_id: ${task.taskId}\nstatus: FAILED\nlocal_path: ${resultDir}\nerror: EVIDENCE_INVALID`;
                fs.writeFileSync(notifyPath, notifyErr);
            } else {
                 // Pass case
                let resJson: any = {};
                try {
                    if (fs.existsSync(resultJsonPath)) {
                        resJson = JSON.parse(fs.readFileSync(resultJsonPath, 'utf-8'));
                        
                        // v3.7 Rule: If RUN failed, Manual Verification cannot override status
                        if (!isSuccess && resJson.status === 'DONE') {
                             console.warn(`[Manager] ⚠️ RUN Failed but status is DONE. Forcing FAILED (v3.7 Rule)`);
                             resJson.status = 'FAILED';
                             statusStr = 'FAILED';
                             resJson.error = "RUN_FAILED: Cannot be overridden by Manual Verification";
                        }
                        
                        if (!resJson.acceptance_check) resJson.acceptance_check = [];
                        resJson.acceptance_check = resJson.acceptance_check.filter((x: any) => x.item !== "Deliverables Index Valid (v3.7)");
                        resJson.acceptance_check.push({ item: "Deliverables Index Valid (v3.7)", pass: true });
                        fs.writeFileSync(resultJsonPath, JSON.stringify(resJson, null, 2));
                    }
                } catch {}
            }
        } catch (e: any) {
            console.error(`[Manager] ❌ Failed to parse/validate index:`, e);
            finalSuccess = false;
            statusStr = 'FAILED';
            
            // Update Result JSON
            let resJson: any = {};
             try {
                if (fs.existsSync(resultJsonPath)) resJson = JSON.parse(fs.readFileSync(resultJsonPath, 'utf-8'));
            } catch {}
            
            resJson.status = 'FAILED';
            resJson.error = `INDEX_VALIDATION_ERROR: ${e.message}`;
            if (!resJson.acceptance_check) resJson.acceptance_check = [];
            resJson.acceptance_check.push({ item: "Deliverables Index Valid (v3.7)", pass: false });
            fs.writeFileSync(resultJsonPath, JSON.stringify(resJson, null, 2));
        }
    }
    // --------------------------------

    // 6. Send to ChatGPT (Unified with generateV37Payload)
    // Reload Result JSON to capture any validation updates
    let resultJsonObj = {};
    try {
        if (fs.existsSync(resultJsonPath)) {
            resultJsonObj = JSON.parse(fs.readFileSync(resultJsonPath, 'utf-8'));
        }
    } catch {}

    const payloadContent = generateV37Payload(task, resultDir, resultJsonObj);
    const payloadPath = path.join(resultDir, `message_payload.txt`);
    fs.writeFileSync(payloadPath, payloadContent);
    // Sync notify.txt
    fs.writeFileSync(notifyPath, payloadContent);

    if (skipSend) {
        console.log(`[Manager] 🛑 Skipping send (Manual Trigger Mode). Payload ready at: ${payloadPath}`);
        return;
    }

    console.log(`[Manager] ⏳ Waiting 5s before sending to ChatGPT...`);
    await new Promise(r => setTimeout(r, 5000));

    console.log(`[Manager] 📨 Sending payload...`);
    
    // Retry Logic for Sending
    const MAX_RETRIES = 3;
    let sent = false;
    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            console.log(`[Manager] Attempt ${i + 1}/${MAX_RETRIES} to send payload...`);
            // Call sender.ts with the payload file
            execSync(`npx tsx "${SENDER_SCRIPT}" "${payloadPath}"`, { stdio: 'inherit' });
            sent = true;
            // Mark as Sent immediately after success
            fs.writeFileSync(receiptMarker, new Date().toISOString());
            console.log(`[Manager] ✅ Receipt sent successfully (Marker written).`);
            break;
        } catch (e) {
            console.error(`[Manager] ⚠️ Send failed (Attempt ${i + 1}):`, e);
            if (i < MAX_RETRIES - 1) {
                const waitTime = 120000; // 2 min wait between retries
                console.log(`[Manager] Waiting ${waitTime/1000}s before retry...`);
                await new Promise(r => setTimeout(r, waitTime));
            }
        }
    }

    if (!sent) {
        console.error(`[Manager] ❌ Failed to send to ChatGPT after ${MAX_RETRIES} attempts.`);
        console.error(`\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
        console.error(`MANUAL INTERVENTION REQUIRED`);
        console.error(`TASK_ID: ${task.taskId}`);
        console.error(`Path: ${resultDir}`);
        console.error(`Notify: ${notifyPath}`);
        console.error(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n`);
        
        // Popup alert logic (simple message box via powershell)
        try {
            execSync(`powershell -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Trae Task Failed to Send to ChatGPT! Please check terminal.', 'Trae Alert', 'OK', 'Error')"`);
        } catch (e) {}
    }
}

async function failTaskImmediate(filename: string, filepath: string, errorMessage: string) {
    console.error(`[Manager] ❌ Immediate Fail: ${errorMessage}`);
    
    // Attempt to extract ID (even from TraeTask)
    // Supports: task_id_XXX.md, TraeTask_XXX.md
    const match = filename.match(/(?:TraeTask_|TASK_ID_|task_id_)?\s*(.+?)\.(txt|md)/);
    const dummyTaskId = match ? match[1].trim() : `INVALID_${Date.now()}`;
    
    const dummyResultDir = path.join(DIRS.results, dummyTaskId);
    if (!fs.existsSync(dummyResultDir)) {
        fs.mkdirSync(dummyResultDir, { recursive: true });
    }

    // Generate FAILED result
    const resultJson = {
        task_id: dummyTaskId,
        version: "2.0",
        status: "FAILED",
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        parser_mode: "strict_prefix",
        error: errorMessage,
        acceptance_check: [
            { item: "Valid Task Prefix", pass: false }
        ],
        artifacts: {
            result_json: `result_${dummyTaskId}.json`,
            notify_txt: `notify_${dummyTaskId}.txt`,
            latest_json: `LATEST.json`
        }
    };
    
    fs.writeFileSync(path.join(dummyResultDir, `result_${dummyTaskId}.json`), JSON.stringify(resultJson, null, 2));

    // Notify.txt
    const notifyContent = `RESULT_READY\ntask_id: ${dummyTaskId}\nstatus: FAILED\nlocal_path: ${dummyResultDir}\nerror: ${errorMessage}`;
    fs.writeFileSync(path.join(dummyResultDir, `notify_${dummyTaskId}.txt`), notifyContent);

    // Log
    fs.writeFileSync(path.join(dummyResultDir, `run_${dummyTaskId}.log`), `[Manager] ❌ Strict Prefix Enforcement: ${errorMessage}\n`);

    // LATEST.json
    const latestJson = { latest_task_id: dummyTaskId, path: `results/${dummyTaskId}/` };
    fs.writeFileSync(path.join(DIRS.results, 'LATEST.json'), JSON.stringify(latestJson, null, 2));

    // Move to Failed
    moveFile(filepath, path.join(DIRS.failed, filename));
}

function moveFile(src: string, dest: string) {
    if (!fs.existsSync(src)) {
        console.warn(`[Manager] ⚠️ moveFile source not found: ${src}`);
        return;
    }
    
    // Create dest dir if needed
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    console.log(`[Watcher] 🚚 Moving: ${path.basename(src)} -> ${path.basename(dest)}`);

    try {
        fs.renameSync(src, dest);
        console.log(`[Watcher] ✅ Moved: ${path.basename(dest)}`);
    } catch (e: any) {
        console.warn(`[Watcher] ⚠️ Atomic rename failed, trying copy-delete... (${e.message})`);
        // Cross-device move fallback
        try {
            fs.copyFileSync(src, dest);
        } catch (copyErr: any) {
            console.error(`[Watcher] ❌ moveFile failed to copy: ${copyErr.message}`);
            // FAIL FAST: Throw to stop processing
            throw new Error(`MOVE_FAILED: ${copyErr.message}`);
        }

        try {
            fs.unlinkSync(src);
        } catch (unlinkErr: any) {
            console.error(`[Watcher] ⚠️ moveFile copied but failed to delete source: ${unlinkErr.message}`);
            // Attempt to rename source to avoid infinite loop
            try {
                const stuckPath = src + '.stuck_' + Date.now();
                fs.renameSync(src, stuckPath);
                console.log(`[Watcher] 🔧 Renamed stuck file to: ${stuckPath}`);
            } catch (renameErr) {
                console.error(`[Watcher] ❌ CRITICAL: Could not delete or rename source file! Infinite loop risk.`);
                // We don't throw here because dest exists, so we can technically proceed, 
                // but this is bad state.
            }
        }
    }
}

main();
