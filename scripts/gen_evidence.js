const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const resultDir = String.raw`E:\polymaket\Github\traeback\results\M0_Flow_v3_2_AddAgentFinalizer_260124_016`;
const payloadPath = path.join(resultDir, 'message_payload.txt');

// Files to check
const evidenceFiles = [
    'Task_Automation_Flow_v3.2.md',
    'finalize_task_v3.2.mjs',
    'deliverables_index_M0_Flow_v3_2_AddAgentFinalizer_260124_016.json',
    'bundle_M0_Flow_v3_2_AddAgentFinalizer_260124_016.zip',
    'result_M0_Flow_v3_2_AddAgentFinalizer_260124_016.json'
];

let report = "\n\n--- EVIDENCE_START ---\n";
report += "1. Artifact Verification:\n";

evidenceFiles.forEach(f => {
    const p = path.join(resultDir, f);
    if (fs.existsSync(p)) {
        const stats = fs.statSync(p);
        const content = fs.readFileSync(p);
        const hash = crypto.createHash('sha256').update(content).digest('hex').substring(0, 8);
        report += `- ${f} (Size: ${stats.size}, SHA256: ${hash})\n`;
    } else {
        report += `- ${f} [MISSING]\n`;
    }
});

report += "\n2. Self-Test Output:\n";
try {
    const selftest = execSync('node "e:\\polymaket\\program\\arb-validate-web\\scripts\\finalize_task_v3.2.mjs" --selftest').toString();
    report += "```\n" + selftest.trim() + "\n```\n";
} catch (e) {
    report += "Self-test failed: " + e.message + "\n";
}

report += "--- EVIDENCE_END ---\n";

console.log(report);

if (fs.existsSync(payloadPath)) {
    fs.appendFileSync(payloadPath, report);
    console.log("Appended to message_payload.txt");
} else {
    console.log("message_payload.txt not found");
}
