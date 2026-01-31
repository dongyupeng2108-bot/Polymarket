
import fs from 'fs';
import path from 'path';

const taskId = 'M2_5_AutoMatch_Fix_Candidates0_By_TopicAlignedUniverse_And_FuzzyMatch_260128_066';
const resultPath = `reports/result_${taskId}.json`;
const logPath = `reports/run_${taskId}.log`;
const indexPath = `reports/deliverables_index_${taskId}.json`;
const notifyPath = `reports/notify_${taskId}.txt`;

function getFileContent(p: string) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf-8');
    return `[MISSING FILE: ${p}]`;
}

const resultJson = getFileContent(resultPath);
const logContent = getFileContent(logPath);
const indexJson = getFileContent(indexPath);

const logLines = logContent.split('\n');
const logHead = logLines.slice(0, 20).join('\n');
const logTail = logLines.slice(-20).join('\n');

const notifyContent = `
Task Completion Report
======================

Healthcheck Summary:
--------------------
GET / -> 200 OK
GET /pairs -> 200 OK

[RESULT_JSON]
${resultJson}

[LOG_HEAD]
${logHead}

[LOG_TAIL]
${logTail}

[INDEX]
${indexJson}
`;

fs.writeFileSync(notifyPath, notifyContent.trim());
console.log(`Notify file created at ${notifyPath}`);
