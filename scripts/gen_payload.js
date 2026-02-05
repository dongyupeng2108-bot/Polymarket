const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TRAEBACK_ROOT = 'E:\\polymaket\\Github\\traeback';
const taskId = 'M0_Flow_v3_4_FixHandoverMarkersAndZipOptional_260124_031';
const resultDir = path.join(TRAEBACK_ROOT, 'results', taskId);
const outputFile = path.join(resultDir, 'message_payload.txt');

function sha256(filePath) {
    try {
        const data = fs.readFileSync(filePath);
        return crypto.createHash('sha256').update(data).digest('hex');
    } catch (e) {
        return 'ERROR';
    }
}

function generateIndex(dir) {
    const files = fs.readdirSync(dir);
    const index = {};
    files.forEach(f => {
        if (f === 'message_payload.txt') return;
        const p = path.join(dir, f);
        const stat = fs.statSync(p);
        if (stat.isFile()) {
            index[f] = {
                size: stat.size,
                sha256: sha256(p)
            };
        }
    });
    return index;
}

try {
    console.log(`Generating payload for ${taskId}...`);

    // 1. Result JSON
    const resultJsonPath = path.join(resultDir, `result_${taskId}.json`);
    const resultJson = fs.readFileSync(resultJsonPath, 'utf8');

    // 2. Log Head/Tail
    const logPath = path.join(resultDir, `run_${taskId}.log`);
    const logContent = fs.readFileSync(logPath, 'utf8');
    const logLines = logContent.split('\n');
    const head = logLines.slice(0, 50).join('\n');
    const tail = logLines.slice(-50).join('\n');

    // 3. Index
    const index = generateIndex(resultDir);
    const indexJson = JSON.stringify(index, null, 2);

    // 4. Construct Payload
    const payload = [
        'RESULT_READY',
        `task_id: ${taskId}`,
        'status: DONE',
        `local_path: ${resultDir}`,
        '',
        '---RESULT_JSON_START---',
        resultJson,
        '---RESULT_JSON_END---',
        '',
        '---LOG_HEAD_START---',
        head,
        '---LOG_HEAD_END---',
        '',
        '---LOG_TAIL_START---',
        tail,
        '---LOG_TAIL_END---',
        '',
        '---INDEX_START---',
        indexJson,
        '---INDEX_END---'
    ].join('\n');

    fs.writeFileSync(outputFile, payload);
    console.log(`Payload written to ${outputFile}`);

} catch (e) {
    console.error('Failed to generate payload:', e);
    process.exit(1);
}
