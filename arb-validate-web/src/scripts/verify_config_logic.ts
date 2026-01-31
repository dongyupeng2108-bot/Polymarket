
import fs from 'fs';
import path from 'path';
import { getRuntimeConfig } from '../lib/config/runtime';

const results: any = {};

console.log('--- Verification: Runtime Config Logic ---');

// Case 1: Default (Prod fallback)
process.env.OPP_MODE = '';
delete process.env.OPP_EDGE_THRESHOLD;
delete process.env.OPP_EDGE_THRESHOLD_DEV;
results.case1 = getRuntimeConfig();
console.log('\n1. Default (No Env):', results.case1);

// Case 2: Prod Mode Explicit
process.env.OPP_MODE = 'prod';
process.env.OPP_EDGE_THRESHOLD = '0.02';
results.case2 = getRuntimeConfig();
console.log('\n2. Prod Mode (0.02):', results.case2);

// Case 3: Dev Mode
process.env.OPP_MODE = 'dev';
process.env.OPP_EDGE_THRESHOLD_DEV = '-0.5';
process.env.OPP_EDGE_THRESHOLD = '0.01'; // Should be ignored
results.case3 = getRuntimeConfig();
console.log('\n3. Dev Mode (-0.5):', results.case3);

// Case 4: Dev Mode Fallback
process.env.OPP_MODE = 'dev';
delete process.env.OPP_EDGE_THRESHOLD_DEV;
process.env.OPP_EDGE_THRESHOLD = '0.03';
results.case4 = getRuntimeConfig();
console.log('\n4. Dev Mode Fallback (0.03):', results.case4);

// Atomic Write
try {
    const outFile = path.resolve(process.cwd(), 'config_verify_result.txt');
    const tempFile = outFile + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(results, null, 2), 'utf-8');
    fs.renameSync(tempFile, outFile);
    console.log(`\n[Verify] Written results to ${outFile}`);
} catch (error) {
    console.error('\n[Verify] Failed to write results:', error);
    process.exit(1);
}
