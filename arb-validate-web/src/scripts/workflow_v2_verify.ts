import fs from 'fs';
import path from 'path';

const ROOT_INPUT = 'E:\\polymaket\\Github\\ChatGPT task';
const ROOT_TRAEBACK = 'E:\\polymaket\\Github\\traeback';
const TASK_ID = 'Verify_V2_Strict_' + Date.now();
const FILENAME = `TraeTask_${TASK_ID}.txt`;

const TEST_TASK_CONTENT = `TraeTask_${TASK_ID}
TASK_ID: ${TASK_ID}
PROJECT_MILESTONE: m0
MILESTONE_TARGET: Verify V2 Strict Mode
DE_SCOPE: Git
GOAL:
- Verify Strict Parsing
- Verify Artifacts
SCOPE:
- None
DELIVERABLES:
- None
ACCEPTANCE:
- Strict Parsing
STOP_CONDITIONS:
- None

字段下的命令列表执行；其它字段（含中文说明）全部作为元信息绝不执行。

RUN:
CMD: echo "STRICT_MODE_START"
中文说明：这一行绝不应该被执行
- echo "Check point 1"
CMD: echo "Check point 2"
   # Comment line
CMD: echo "STRICT_MODE_END"
本次任务发布完毕。
`;

async function main() {
    console.log(`[Verify] 🚀 Starting V2 Strict Verification...`);
    console.log(`[Verify] Task ID: ${TASK_ID}`);

    // 1. Create Task File
    const inputPath = path.join(ROOT_INPUT, FILENAME);
    fs.writeFileSync(inputPath, TEST_TASK_CONTENT);
    console.log(`[Verify] 📄 Created task file: ${inputPath}`);

    // 2. Wait for Result
    const resultDir = path.join(ROOT_TRAEBACK, 'results', TASK_ID);
    const resultJsonPath = path.join(resultDir, `result_${TASK_ID}.json`);
    
    console.log(`[Verify] ⏳ Waiting for result in: ${resultDir}`);
    
    let attempts = 0;
    while (!fs.existsSync(resultJsonPath)) {
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
        if (attempts % 10 === 0) process.stdout.write('.');
        if (attempts > 300) { // 10 mins
            console.error(`\n[Verify] ❌ Timeout waiting for result.`);
            process.exit(1);
        }
    }
    console.log(`\n[Verify] 📥 Result found! Validating...`);

    // 3. Validate Artifacts
    const result = JSON.parse(fs.readFileSync(resultJsonPath, 'utf-8'));
    
    // Check Status
    if (result.status !== 'DONE') {
        console.error(`[Verify] ❌ Task Status is ${result.status}, expected DONE.`);
        process.exit(1);
    }
    console.log(`[Verify] ✅ Status is DONE`);

    // Check Version & Strict Mode
    if (result.version !== '2.0' || result.parser_mode !== 'strict') {
        console.error(`[Verify] ❌ Version/Mode mismatch: ${result.version}/${result.parser_mode}`);
        process.exit(1);
    }
    console.log(`[Verify] ✅ Version 2.0 & Strict Mode`);

    // Check Metrics
    // We have 4 commands: strict start, check 1, check 2, strict end.
    if (result.commands_total !== 4 || result.commands_executed !== 4) {
         console.error(`[Verify] ❌ Command count mismatch. Total: ${result.commands_total}, Executed: ${result.commands_executed}. Expected 4.`);
         process.exit(1);
    }
    console.log(`[Verify] ✅ Command counts correct (4/4)`);

    // Check Log Content (Strict Parsing)
    const logPath = path.join(resultDir, `run_${TASK_ID}.log`);
    const logContent = fs.readFileSync(logPath, 'utf-8');
    
    if (!logContent.includes('STRICT_MODE_START') || !logContent.includes('STRICT_MODE_END')) {
        console.error(`[Verify] ❌ Log missing expected output.`);
        process.exit(1);
    }
    if (logContent.includes('中文说明') || logContent.includes('绝不应该被执行')) {
        console.error(`[Verify] ❌ Log contains non-command lines! Strict parsing failed.`);
        process.exit(1);
    }
    console.log(`[Verify] ✅ Log content verifies strict parsing`);

    // Check 5-Piece Set
    const files = [
        `result_${TASK_ID}.json`,
        `notify_${TASK_ID}.txt`,
        `run_${TASK_ID}.log`,
        `deliverables_index_${TASK_ID}.json`,
        `bundle_${TASK_ID}.zip`
    ];
    for (const f of files) {
        if (!fs.existsSync(path.join(resultDir, f))) {
            console.error(`[Verify] ❌ Missing artifact: ${f}`);
            process.exit(1);
        }
    }
    console.log(`[Verify] ✅ All 5 artifacts present`);

    // Check Bundle Content (Size check)
    const bundlePath = path.join(resultDir, `bundle_${TASK_ID}.zip`);
    const stats = fs.statSync(bundlePath);
    if (stats.size === 0) {
        console.error(`[Verify] ❌ Bundle is empty`);
        process.exit(1);
    }
    console.log(`[Verify] ✅ Bundle created (Size: ${stats.size})`);

    // Check LATEST.json
    const latestPath = path.join(ROOT_TRAEBACK, 'results', 'LATEST.json');
    const latest = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
    if (latest.latest_task_id !== TASK_ID) {
        console.error(`[Verify] ❌ LATEST.json not updated. Found: ${latest.latest_task_id}`);
        process.exit(1);
    }
    console.log(`[Verify] ✅ LATEST.json updated`);

    console.log(`[Verify] 🎉 V2 STRICT VERIFICATION PASSED!`);
    process.exit(0);
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
