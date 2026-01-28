import { fork } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(__dirname, 'postflight_validate_envelope.mjs');

// Wrapper to satisfy deliverable requirement "scripts/postflight_selftest_v39.mjs"
// Invokes the main validator with the selftest contract flag.
fork(script, ['--selftest_v39_contract', 'true', ...process.argv.slice(2)]);
