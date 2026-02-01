const fs = require('fs');
const path = require('path');

const TRAEBACK_ROOT = 'E:\\polymaket\\Github\\traeback';
const LOCAL_SCRIPTS = 'E:\\polymaket\\program\\arb-validate-web\\scripts';
const TEMP_TASK_FILE = path.join(LOCAL_SCRIPTS, 'temp_task_retry.md');
const TARGET_TASK_FILE = path.join(TRAEBACK_ROOT, 'TraeTask_M0_Flow_v3_4_FixHandoverMarkersAndZipOptional_260124_031_Retry.md');

// 1. Copy updated scripts
const scriptsToCopy = ['selftest_handover_finalizer_v3.4.mjs', 'smart_agent_handover.mjs'];
scriptsToCopy.forEach(script => {
    const src = path.join(LOCAL_SCRIPTS, script);
    const dest = path.join(TRAEBACK_ROOT, 'scripts', script);
    if (fs.existsSync(src)) {
        console.log(`Updating ${script}...`);
        try {
            fs.copyFileSync(src, dest);
            console.log(`Updated ${script}`);
        } catch (e) {
            console.error(`Failed to update ${script}:`, e);
        }
    } else {
        console.error(`Missing local script: ${script}`);
    }
});

// 2. Move Task File
console.log(`Copying new task file to root: ${TARGET_TASK_FILE}`);
try {
    if (fs.existsSync(TEMP_TASK_FILE)) {
        fs.copyFileSync(TEMP_TASK_FILE, TARGET_TASK_FILE);
        console.log('Task file created.');
    } else {
        console.error('Temp task file not found:', TEMP_TASK_FILE);
    }
} catch (e) {
    console.error('Failed to create task file:', e);
}

/*
const failedTaskFile = path.join(TRAEBACK_ROOT, 'failed', 'task_id_ M0_Flow_v3_4_FixHandoverMarkersAndZipOptional_260124_031.md');
const retryTaskFile = path.join(TRAEBACK_ROOT, 'task_id_ M0_Flow_v3_4_FixHandoverMarkersAndZipOptional_260124_031.md');

if (fs.existsSync(failedTaskFile)) {
    try {
        fs.copyFileSync(failedTaskFile, retryTaskFile);
        if (fs.existsSync(retryTaskFile)) {
            console.log('Task file copied to root for retry.');
            fs.unlinkSync(failedTaskFile);
            console.log('Deleted failed task file.');
        }
    } catch (e) {
        console.error('Failed to move task file:', e);
    }
} else {
    console.log('Failed task file not found (maybe already moved?):', failedTaskFile);
}
*/


// 3. Clean up junk files in root
console.log('Cleaning up junk files...');
const junkFiles = [
    'TraeTask_SelfTest_v2.txt',
    'TraeTask_Strict_Verify.txt',
    'TraeTask_Strict_Verify_v3.txt',
    'TraeTask_Strict_Verify_v4.txt',
    'TraeTask_VerifyV2.txt',
    'TraeTask_Verify_V2_Strict_1769187997684.txt',
    'TraeTask_Verify_V2_Strict_1769199916368.txt'
];

// Clean up results directory for the specific task to force re-run
// const taskResultDir = path.join(TRAEBACK_ROOT, 'results', 'M0_Flow_v3_4_FixHandoverMarkersAndZipOptional_260124_031');
// if (fs.existsSync(taskResultDir)) {
//     console.log(`Cleaning up results directory: ${taskResultDir}`);
//     try {
//         fs.rmSync(taskResultDir, { recursive: true, force: true });
//         console.log('Deleted results directory.');
//     } catch (e) {
//         console.error('Failed to delete results directory:', e);
//     }
// }

junkFiles.forEach(f => {
    const p = path.join(TRAEBACK_ROOT, f);
    if (fs.existsSync(p)) {
        try {
            fs.unlinkSync(p);
            console.log(`Deleted junk file: ${f}`);
        } catch (e) {
            console.error(`Failed to delete ${f}:`, e);
        }
    }
});
