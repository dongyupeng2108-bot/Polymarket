
import fs from 'fs';
import path from 'path';

// Error Codes
const ERR = {
    KILL_SWITCH_TRAETASK_PREFIX: 'KILL_SWITCH_TRAETASK_PREFIX',
    INVALID_TASK_FORMAT: 'INVALID_TASK_FORMAT',
    NO_VALID_COMMANDS_FOUND: 'NO_VALID_COMMANDS_FOUND',
    MISSING_SENTINEL: 'MISSING_SENTINEL',
    CODEBLOCK_FORBIDDEN: 'CODEBLOCK_FORBIDDEN',
    SELF_CHECKLINE_INVALID: 'SELF_CHECKLINE_INVALID',
    FILE_READ_ERROR: 'FILE_READ_ERROR'
};

const TARGET_FILE = process.argv[2];

if (!TARGET_FILE) {
    console.error(`Usage: node preflight_validate_task.mjs <task_file_path>`);
    process.exit(1);
}

try {
    const content = fs.readFileSync(TARGET_FILE, 'utf8');
    const lines = content.split(/\r?\n/);
    
    // 1. Check for TraeTask prefix (FATAL) in content or filename
    const filename = path.basename(TARGET_FILE);
    // REMOVED: TraeTask kill switch logic as per P0.1 requirement
    // if (filename.startsWith('TraeTask') || content.includes('TraeTask')) { ... }

    // 2. FIRST_NONEMPTY_LINE check
    const firstNonEmptyLine = lines.find(l => l.trim().length > 0);
    if (!firstNonEmptyLine || !/^task_id:\s*[A-Za-z0-9_]+$/.test(firstNonEmptyLine.trim())) {
        // Relaxed regex to match any task_id format, e.g. M1_..., P0_...
        if (!firstNonEmptyLine?.startsWith('task_id:')) {
             console.error(`[Preflight] ERROR: ${ERR.INVALID_TASK_FORMAT} - First line must start with 'task_id:'. Found: ${firstNonEmptyLine}`);
             process.exit(1);
        }
    }

    // 3. Milestone Check
    // Requirement: Extract first token after milestone: as version (e.g. P0.1), allow suffix
    const milestoneLine = lines.find(l => l.trim().startsWith('milestone:'));
    if (!milestoneLine) {
         console.error(`[Preflight] ERROR: ${ERR.INVALID_TASK_FORMAT} - Missing 'milestone: Mx'`);
         process.exit(1);
    }
    // Check if it contains at least one token like Mx or Px.y
    if (!/milestone:\s*[MP][\d\.]+/.test(milestoneLine)) {
         console.error(`[Preflight] ERROR: ${ERR.INVALID_TASK_FORMAT} - 'milestone:' must be followed by a version (e.g. M1, P0.1). Found: ${milestoneLine}`);
         process.exit(1);
    }

    // 4. RUN Block Check
    if (!content.includes('RUN:')) {
         console.error(`[Preflight] ERROR: ${ERR.INVALID_TASK_FORMAT} - Missing 'RUN:' block`);
         process.exit(1);
    }

    // 5. Valid Commands Check
    let validCmdCount = 0;
    const runIndex = lines.findIndex(l => l.trim() === 'RUN:');
    if (runIndex >= 0) {
        const afterRun = lines.slice(runIndex + 1);
        const cmds = afterRun.filter(l => l.trim().startsWith('CMD:') || l.trim().startsWith('- '));
        if (cmds.length > 0) validCmdCount = cmds.length;
    }

    if (validCmdCount === 0) {
        console.error(`[Preflight] ERROR: ${ERR.NO_VALID_COMMANDS_FOUND} - RUN block exists but no commands (CMD:/- ) found.`);
        process.exit(1);
    }

    // 6. Sentinel Check
    const lastNonEmptyLine = [...lines].reverse().find(l => l.trim().length > 0);
    if (!lastNonEmptyLine || lastNonEmptyLine.trim() !== '本次任务发布完毕。') {
        console.error(`[Preflight] ERROR: ${ERR.MISSING_SENTINEL} - Last line must be '本次任务发布完毕。'`);
        process.exit(1);
    }

    // 7. No Codeblock Check
    if (content.includes('```')) {
        console.error(`[Preflight] ERROR: ${ERR.CODEBLOCK_FORBIDDEN} - Markdown code blocks (\`\`\`) are forbidden.`);
        process.exit(1);
    }

    // 8. Self Check Line
    // v3.9 Spec (QUALITY_GATE_SPEC_V1_1.md)
    // Required: MODE=TASK;FORMAT=v3.9;TASK_ID_OK=1;RUN_OK=1;SENTINEL_OK=1;CODEFENCE_OK=1
    // Legacy support (optional): MODE=TASK, FIRSTLINE=task_id, etc.
    
    const requiredMarkersV39 = [
        'MODE=TASK', 'FORMAT=v3.9', 'TASK_ID_OK=1', 'RUN_OK=1', 'SENTINEL_OK=1', 'CODEFENCE_OK=1'
    ];

    const requiredMarkersLegacy = [
        'MODE=TASK', 'FIRSTLINE=task_id', 'NO_CODEBLOCK', 
        'HAS_MILESTONE+RUN', 'RUN_CMDS_OK', 'END_SENTINEL_OK', 'FAIL_FAST_OK'
    ];
    
    const selfCheckLine = lines.find(l => {
        if (l.includes('FORMAT=v3.9')) {
             return requiredMarkersV39.every(m => l.includes(m));
        }
        return requiredMarkersLegacy.every(m => l.includes(m));
    });
    
    if (!selfCheckLine) {
        console.error(`[Preflight] ERROR: ${ERR.SELF_CHECKLINE_INVALID} - Missing valid self-check line (v3.9 or Legacy) with all markers.`);
        process.exit(1);
    }

    console.log(`[Preflight] PASS: ${filename} is valid.`);
    process.exit(0);

} catch (err) {
    console.error(`[Preflight] SYSTEM ERROR: ${err.message}`);
    process.exit(1);
}
