
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '../temp_results');
const destDir = 'e:\\polymaket\\Github\\traeback\\results\\M1_5_PairsMgmt_AutoMatch_Task035_Diag_ZeroScan_Reconnect_AllUnverified_260126_035';
const taskId = 'M1_5_PairsMgmt_AutoMatch_Task035_Diag_ZeroScan_Reconnect_AllUnverified_260126_035';

console.log(`Copying from ${srcDir} to ${destDir}`);

try {
    if (!fs.existsSync(destDir)) {
        console.log('Creating destination directory...');
        fs.mkdirSync(destDir, { recursive: true });
    }

    // Map source files to destination files
    const fileMap = {
        'result_fixed.json': `result_${taskId}.json`,
        'notify_fixed.txt': `notify_${taskId}.txt`,
        // 'run.log' is inside the task subdir in temp_results
    };
    
    // Copy fixed files
    for (const [src, dest] of Object.entries(fileMap)) {
        const srcPath = path.join(srcDir, src);
        const destPath = path.join(destDir, dest);
        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, destPath);
            console.log(`Copied ${src} to ${dest}`);
        } else {
            console.error(`Source file not found: ${srcPath}`);
        }
    }
    
    // Copy run.log (it was in the subdir)
    const runLogSrc = path.join(srcDir, taskId, 'run.log');
    const runLogDest = path.join(destDir, `run_${taskId}.log`);
    
    if (fs.existsSync(runLogSrc)) {
        fs.copyFileSync(runLogSrc, runLogDest);
        console.log(`Copied run.log to run_${taskId}.log`);
    } else {
         // Try checking run.log in temp_results root if moved
         const runLogSrc2 = path.join(srcDir, 'run.log');
         if (fs.existsSync(runLogSrc2)) {
             fs.copyFileSync(runLogSrc2, runLogDest);
             console.log(`Copied run.log to run_${taskId}.log`);
         } else {
            console.error(`run.log not found at ${runLogSrc} or ${runLogSrc2}`);
         }
    }
    
    // Also need LATEST.json
    fs.writeFileSync(path.join(destDir, 'LATEST.json'), JSON.stringify({
        task_id: taskId,
        status: "DONE",
        timestamp: new Date().toISOString()
    }, null, 2));
    console.log('Created LATEST.json');

    console.log('Copy complete.');
} catch (err) {
    console.error('Copy failed:', err);
    process.exit(1);
}
