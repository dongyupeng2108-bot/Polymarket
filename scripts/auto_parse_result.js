const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- Helpers ---
function sha256Short(content) {
    return crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
}

// --- Core Logic ---

function parseResultReady(text) {
    const result = {
        task_id: null,
        status: null,
        local_path: null,
        artifacts: {},
        acceptance_check: [],
        log_head: null,
        log_tail: null,
        index_files: []
    };

    // Extract Header
    // Expected: RESULT_READY <task_id> <status> <path>
    // Or lines:
    // task_id: ...
    // status: ...
    const taskIdMatch = text.match(/task_id:\s*([^\s]+)/i) || text.match(/RESULT_READY\s+([^\s]+)/);
    if (taskIdMatch) result.task_id = taskIdMatch[1];

    const statusMatch = text.match(/status:\s*([^\s]+)/i) || text.match(/RESULT_READY\s+[^\s]+\s+([^\s]+)/);
    if (statusMatch) result.status = statusMatch[1];

    const pathMatch = text.match(/local_path:\s*([^\s]+)/i) || text.match(/RESULT_READY\s+[^\s]+\s+[^\s]+\s+([^\s]+)/);
    if (pathMatch) result.local_path = pathMatch[1];

    // Extract Blocks
    const extractBlock = (marker) => {
        const regex = new RegExp(`---${marker}_START---([\\s\\S]*?)---${marker}_END---`);
        const match = text.match(regex);
        return match ? match[1].trim() : null;
    };

    const resultJsonRaw = extractBlock('RESULT_JSON');
    if (resultJsonRaw) {
        try {
            const json = JSON.parse(resultJsonRaw);
            result.artifacts = json.artifacts || {};
            result.acceptance_check = json.acceptance_check || [];
            // Merge header info if missing
            if (!result.task_id) result.task_id = json.task_id;
            if (!result.status) result.status = json.status;
        } catch (e) {
            console.error("Error parsing RESULT_JSON block:", e);
        }
    }

    result.log_head = extractBlock('LOG_HEAD');
    result.log_tail = extractBlock('LOG_TAIL');

    const indexRaw = extractBlock('INDEX'); // deliverables_index content
    if (indexRaw) {
        try {
            const indexJson = JSON.parse(indexRaw);
            result.index_files = Array.isArray(indexJson) ? indexJson : [];
        } catch (e) {
            // Try parsing line by line if not JSON?
            // Assuming JSON for now as per v3.2/v3.3 specs
        }
    }

    return result;
}

function validateEvidencePack(parsed) {
    const errors = [];
    const missing = [];

    if (!parsed.task_id) missing.push("task_id");
    if (!parsed.status) missing.push("status");
    
    // Check Artifacts
    const requiredArtifacts = ['result_json', 'notify_txt', 'bundle_zip']; // loose check
    // If we parsed result.json, we have artifacts list
    if (parsed.artifacts) {
        if (!parsed.artifacts.result_json) missing.push("result.json (in artifacts)");
        if (!parsed.artifacts.notify_txt) missing.push("notify.txt (in artifacts)");
        // deliverables_index might be in artifacts or parsed separately
    } else {
        missing.push("RESULT_JSON block");
    }

    if (!parsed.log_head && !parsed.log_tail) missing.push("LOG_HEAD/TAIL");
    if (!parsed.index_files || parsed.index_files.length === 0) missing.push("INDEX block");

    return {
        valid: missing.length === 0,
        missing: missing,
        errors: errors
    };
}

function generateNextTask(parsed, outDir) {
    const nextTaskId = `Next_${parsed.task_id}_${Date.now()}`;
    const filename = `${nextTaskId}.md`; // STRICT: Filename starts with ID? 
    // Requirement: "生成文件名必须以 <task_id> 开头" -> "Next_..." is the ID.
    // So filename: Next_... .md
    
    const filePath = path.join(outDir, filename);

    const content = `task_id: ${nextTaskId}
milestone: auto-generated
GOAL: Process result from ${parsed.task_id}
SCOPE:
Auto-generated task to process results.
ACCEPTANCE:
Check logs.
RUN:
CMD: echo "Processing ${parsed.task_id}"
CMD: dir
`;

    fs.writeFileSync(filePath, content);
    return { path: filePath, content: content, id: nextTaskId };
}

function runSelfTest() {
    console.log("[INFO] Running Self-Test...");
    
    // Mock Data
    const mockTaskId = "TEST_TASK_001";
    const mockResultJson = {
        task_id: mockTaskId,
        status: "DONE",
        artifacts: {
            result_json: "result.json",
            notify_txt: "notify.txt",
            bundle_zip: "bundle.zip"
        },
        acceptance_check: [{ item: "Test", pass: true }]
    };
    
    const mockIndex = [
        { name: "test.txt", size: 100, sha256_short: "abcdef12" }
    ];

    const sampleText = `
RESULT_READY ${mockTaskId} DONE /tmp/test_task_001
---RESULT_JSON_START---
${JSON.stringify(mockResultJson, null, 2)}
---RESULT_JSON_END---
---LOG_HEAD_START---
[INFO] Started
---LOG_HEAD_END---
---LOG_TAIL_START---
[INFO] Finished
---LOG_TAIL_END---
---INDEX_START---
${JSON.stringify(mockIndex, null, 2)}
---INDEX_END---
`;

    // 1. Parse
    const parsed = parseResultReady(sampleText);
    if (parsed.task_id === mockTaskId && parsed.status === "DONE") {
        console.log("PARSE_OK");
        console.log(`  task_id: ${parsed.task_id}`);
        console.log(`  status: ${parsed.status}`);
        console.log(`  local_path: ${parsed.local_path}`);
    } else {
        console.error("PARSE_FAILED");
    }

    // 2. Validate
    const validation = validateEvidencePack(parsed);
    if (validation.valid) {
        console.log("EVIDENCE_OK");
    } else {
        console.error("EVIDENCE_FAILED:", validation.missing);
    }

    // 3. Generate Next
    // Use current dir for output
    const outDir = path.join(__dirname, '../results');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    
    const gen = generateNextTask(parsed, outDir);
    console.log(`NEXT_TASK_WRITTEN: ${gen.path}`);
    
    // 4. Strict Check
    const lines = gen.content.split('\n');
    const firstLine = lines[0];
    const hasRun = lines.some(l => l.trim() === 'RUN:');
    const hasCmd = lines.some(l => l.trim().startsWith('CMD:'));
    
    if (firstLine.startsWith(`task_id: ${gen.id}`) && hasRun && hasCmd) {
        console.log("STRICT_FORMAT_OK");
    } else {
        console.error("STRICT_FORMAT_FAILED");
    }
}

// CLI
if (process.argv.includes('--selftest')) {
    runSelfTest();
} else {
    // Placeholder for real usage
    console.log("Usage: node auto_parse_result.js --selftest");
}

module.exports = { parseResultReady, validateEvidencePack, generateNextTask };
