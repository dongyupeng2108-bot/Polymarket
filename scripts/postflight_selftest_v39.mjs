
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const scriptPath = path.join(__dirname, 'postflight_validate_envelope.mjs');

console.log(`[Wrapper] Running Postflight Self-Test (v3.9+)...`);

const child = spawn('node', [scriptPath, '--selftest_v39_contract', '--out', 'postflight_selftest_057.txt'], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..') // Run from project root or relative? The main script assumes execution context.
    // The main script uses process.cwd() or args.
    // But here we just want to run it.
});

child.on('close', (code) => {
    process.exit(code);
});
