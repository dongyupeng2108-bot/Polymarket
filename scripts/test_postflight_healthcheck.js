const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const baseDir = path.join(__dirname, 'temp_test_postflight');
const postflightScript = path.join(__dirname, 'postflight_validate_envelope.mjs');

function createCase(name, logContent, indexFiles, extraFiles = {}) {
    const dir = path.join(baseDir, name);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });

    const taskId = `T_${name}`;
    
    // Create artifacts
    fs.writeFileSync(path.join(dir, `result_${taskId}.json`), JSON.stringify({ status: 'DONE' }));
    fs.writeFileSync(path.join(dir, `notify_${taskId}.txt`), `RESULT_JSON\nLOG_HEAD\nLOG_TAIL\nINDEX`);
    
    // Pad log to > 500 bytes
    const paddedLog = logContent + '\n' + '-'.repeat(600);
    fs.writeFileSync(path.join(dir, `run_${taskId}.log`), paddedLog);
    fs.writeFileSync(path.join(dir, `LATEST.json`), '{}');
    
    const indexData = { files: indexFiles };
    fs.writeFileSync(path.join(dir, `deliverables_index_${taskId}.json`), JSON.stringify(indexData));
    
    // Extra files
    for (const [fname, content] of Object.entries(extraFiles)) {
        fs.writeFileSync(path.join(dir, fname), content);
    }
    
    return { dir, taskId };
}

function runTest(name, shouldPass) {
    console.log(`\n--- Running Test: ${name} ---`);
    const { dir, taskId } = cases[name];
    try {
        execSync(`node "${postflightScript}" --task_id "${taskId}" --result_dir "${dir}"`, { stdio: 'pipe' });
        if (shouldPass) {
            console.log(`[PASS] ${name} passed as expected.`);
        } else {
            console.log(`[FAIL] ${name} passed but should have FAILED.`);
        }
    } catch (e) {
        if (!shouldPass) {
            console.log(`[PASS] ${name} failed as expected.`);
            console.log(`Output: ${e.stdout.toString()}`);
            console.log(`Error: ${e.stderr.toString()}`);
        } else {
            console.log(`[FAIL] ${name} failed but should have PASSED.`);
            console.log(`Output: ${e.stdout.toString()}`);
            console.log(`Error: ${e.stderr.toString()}`);
        }
    }
}

const cases = {};

// Case A: Fail - Involves arb-web but missing evidence
cases['case_A'] = createCase('case_A', 
    'CMD: cd E:\\polymaket\\program\\arb-validate-web\nRunning...', 
    []
);

// Case B: Pass - Involves arb-web and has evidence
cases['case_B'] = createCase('case_B', 
    'CMD: cd E:\\polymaket\\program\\arb-validate-web\nRunning...', 
    [{ name: 'healthcheck.txt', size: 100, sha256_short: 'abc' }],
    { 'healthcheck.txt': '[HealthCheck] / -> 200\n[HealthCheck] /pairs -> 200' }
);

// Case C: Pass - Irrelevant
cases['case_C'] = createCase('case_C', 
    'CMD: echo hello\nRunning...', 
    []
);

runTest('case_A', false);
runTest('case_B', true);
runTest('case_C', true);
