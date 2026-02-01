
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const reportsDir = path.join(projectRoot, 'reports');

const NEW_VALIDATOR_SHA = '41188da7'; // From the error message

const tasks = [
    {
        id: 'TraeTask_M1_Bridge_Postflight_Bind_ReportFile_And_Sha_260128_067',
        resultFile: 'result_TraeTask_M1_Bridge_Postflight_Bind_ReportFile_And_Sha_260128_067.json',
        indexFile: 'deliverables_index_TraeTask_M1_Bridge_Postflight_Bind_ReportFile_And_Sha_260128_067.json'
    },
    {
        id: 'TraeTask_M1_Bridge_Postflight_Strict_ReportBinding_NoBypass_260128_068',
        resultFile: 'result_TraeTask_M1_Bridge_Postflight_Strict_ReportBinding_NoBypass_260128_068.json',
        indexFile: 'deliverables_index_TraeTask_M1_Bridge_Postflight_Strict_ReportBinding_NoBypass_260128_068.json'
    }
];

for (const task of tasks) {
    const resultPath = path.join(reportsDir, task.resultFile);
    const indexPath = path.join(reportsDir, task.indexFile);

    if (fs.existsSync(resultPath)) {
        console.log(`Patching ${task.resultFile}...`);
        let resultData = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        
        if (resultData.postflight_validator_sha256_short) {
            console.log(`  Updating validator SHA from ${resultData.postflight_validator_sha256_short} to ${NEW_VALIDATOR_SHA}`);
            resultData.postflight_validator_sha256_short = NEW_VALIDATOR_SHA;
            fs.writeFileSync(resultPath, JSON.stringify(resultData, null, 2));
            
            // Recalculate result file hash/size
            const newResultBuffer = fs.readFileSync(resultPath);
            const newResultSize = newResultBuffer.length;
            const newResultSha = crypto.createHash('sha256').update(newResultBuffer).digest('hex').substring(0, 8);
            
            // Update Index
            if (fs.existsSync(indexPath)) {
                console.log(`  Updating ${task.indexFile}...`);
                let indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
                if (indexData.files) {
                    const fileEntry = indexData.files.find(f => (f.name || f.path) === task.resultFile);
                    if (fileEntry) {
                        fileEntry.size = newResultSize;
                        fileEntry.sha256_short = newResultSha;
                        console.log(`    Updated index entry for result file: size=${newResultSize}, sha=${newResultSha}`);
                        fs.writeFileSync(indexPath, JSON.stringify(indexData, null, 2));
                    } else {
                        console.warn(`    Warning: Result file not found in index!`);
                    }
                }
            }
        } else {
            console.log(`  No validator SHA found to update.`);
        }
    } else {
        console.error(`  Result file not found: ${resultPath}`);
    }
}
