
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
if (args.length < 2) {
    console.error('Usage: node gen_payload_manual.js <taskId> <taskDir>');
    process.exit(1);
}

const taskId = args[0];
const resultDir = args[1];
const outputFile = path.join(resultDir, `payload_${taskId}.txt`);

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
        if (f.startsWith('payload_') && f.endsWith('.txt')) return; // Ignore self
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
    if (!fs.existsSync(resultJsonPath)) throw new Error('Result JSON not found: ' + resultJsonPath);
    const resultJson = fs.readFileSync(resultJsonPath, 'utf8');

    // 2. Log Head/Tail
    const logPath = path.join(resultDir, `run_${taskId}.log`);
    if (!fs.existsSync(logPath)) throw new Error('Run Log not found: ' + logPath);
    const logContent = fs.readFileSync(logPath, 'utf8');
    const logLines = logContent.split('\n');
    const head = logLines.slice(0, 50).join('\n');
    const tail = logLines.slice(-50).join('\n');

    // 3. Index
    const index = generateIndex(resultDir);

    // 4. Construct Payload
    const payload = `RESULT_READY
[RESULT_JSON]
${resultJson}
[LOG_HEAD]
${head}
[LOG_TAIL]
${tail}
[INDEX]
${JSON.stringify(index, null, 2)}
[LOCAL_PATH]
${resultDir}
`;

    fs.writeFileSync(outputFile, payload);
    console.log(`Payload generated at: ${outputFile}`);
} catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
}
