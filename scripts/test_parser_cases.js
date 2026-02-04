
const fs = require('fs');
const path = require('path');

// Mocking the parseTask logic from task_manager.ts (Current Version)
function parseTask(content, filename) {
    // v3.4 Strict Rule: task_id must be the first non-empty line
    const lines = content.split(/\r?\n/);
    const firstNonEmpty = lines.find(l => l.trim().length > 0);
    
    if (!firstNonEmpty) throw new Error('EMPTY_FILE');
    
    // Check if first non-empty line is TASK_ID
    // CURRENT BUGGY LOGIC: Match against raw line which might have spaces
    const taskIdMatch = firstNonEmpty.match(/^task_id:\s*(.+)/i);
    
    if (!taskIdMatch) {
        throw new Error('INVALID_HEADER: First non-empty line must be "task_id: <ID>" (v3.4 Rule)');
    }

    return taskIdMatch[1].trim();
}

// Improved Logic (Proposed Fix)
function parseTaskFixed(content, filename) {
    // 1. Remove BOM if present
    const cleanContent = content.replace(/^\uFEFF/, '');
    
    const lines = cleanContent.split(/\r?\n/);
    // 2. Find first non-empty line
    const firstNonEmpty = lines.find(l => l.trim().length > 0);
    
    if (!firstNonEmpty) throw new Error('EMPTY_FILE');
    
    // 3. Match against TRIMMED line to handle leading indentation
    const taskIdMatch = firstNonEmpty.trim().match(/^task_id:\s*(.+)/i);
    
    if (!taskIdMatch) {
        throw new Error('INVALID_HEADER: First non-empty line must be "task_id: <ID>" (v3.4 Rule)');
    }

    return taskIdMatch[1].trim();
}

const testDir = path.join(__dirname, 'test_cases_parser');
if (!fs.existsSync(testDir)) fs.mkdirSync(testDir);

const cases = [
    {
        name: 'case1_normal_TASK_ID.txt',
        content: `TASK_ID: CASE_1_NORMAL\nRUN:\nCMD: echo 1\n本次任务发布完毕。`
    },
    {
        name: 'case2_lowercase_task_id.txt',
        content: `task_id: CASE_2_LOWER\nRUN:\nCMD: echo 1\n本次任务发布完毕。`
    },
    {
        name: 'case3_bom_TASK_ID.txt',
        content: `\uFEFFTASK_ID: CASE_3_BOM\nRUN:\nCMD: echo 1\n本次任务发布完毕。`
    },
    {
        name: 'case4_leading_space_TASK_ID.txt',
        content: `\n   \n  TASK_ID: CASE_4_SPACE\nRUN:\nCMD: echo 1\n本次任务发布完毕。`
    }
];

console.log('--- Creating Test Files ---');
cases.forEach(c => {
    fs.writeFileSync(path.join(testDir, c.name), c.content, 'utf8');
    console.log(`Created ${c.name}`);
});

console.log('\n--- Running Tests (Current Logic) ---');
let fails = 0;
cases.forEach(c => {
    try {
        const id = parseTask(c.content, c.name);
        console.log(`[PASS] ${c.name} -> ID: ${id}`);
    } catch (e) {
        console.log(`[FAIL] ${c.name} -> Error: ${e.message}`);
        fails++;
    }
});

console.log('\n--- Running Tests (Fixed Logic) ---');
let fixedPasses = 0;
cases.forEach(c => {
    try {
        const id = parseTaskFixed(c.content, c.name);
        console.log(`[PASS] ${c.name} -> ID: ${id}`);
        fixedPasses++;
    } catch (e) {
        console.log(`[FAIL] ${c.name} -> Error: ${e.message}`);
    }
});

if (fixedPasses === cases.length) {
    console.log('\nALL_TESTS_PASS');
} else {
    console.log('\nSOME_TESTS_FAILED');
}
