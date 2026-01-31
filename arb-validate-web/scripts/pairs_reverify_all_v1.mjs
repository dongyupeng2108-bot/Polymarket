import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsScript = path.join(__dirname, 'pairs_reverify_all_v1.ts');

// Pass all arguments (including --dry-run) to the TS script
const args = ['tsx', tsScript, ...process.argv.slice(2)];

// Use npx.cmd on Windows, npx on others
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

console.log(`[Wrapper] Executing: ${npx} ${args.join(' ')}`);

const child = spawn(npx, args, { 
    stdio: 'inherit',
    shell: true 
});

child.on('exit', (code) => {
    process.exit(code ?? 0);
});
