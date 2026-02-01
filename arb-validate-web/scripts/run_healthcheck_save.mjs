
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const logFile = path.resolve('E:\\polymaket\\program\\arb-validate-web\\healthcheck_53121.txt');
const scriptPath = path.resolve('E:\\polymaket\\program\\arb-validate-web\\scripts\\healthcheck_http_v1.mjs');

console.log('Running healthcheck...');
const child = spawn('node', [scriptPath], {
    cwd: path.dirname(scriptPath),
    stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';

child.stdout.on('data', (data) => {
    process.stdout.write(data);
    output += data.toString();
});

child.stderr.on('data', (data) => {
    process.stderr.write(data);
    output += data.toString();
});

child.on('close', (code) => {
    fs.writeFileSync(logFile, output, 'utf8');
    console.log(`\nSaved output to ${logFile}`);
    process.exit(code);
});
