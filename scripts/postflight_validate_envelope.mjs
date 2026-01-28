import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const LOG_MIN_SIZE_BYTES = 500; // Configurable threshold
const PLACEHOLDER_LOG_TEXT = "NO LOG FOUND - Created by Finalizer";

// --- Error Codes ---
const ERR = {
    MISSING_ARTIFACT: 'POSTFLIGHT_MISSING_ARTIFACT',
    ENVELOPE_MISSING: 'POSTFLIGHT_ENVELOPE_SECTIONS_MISSING',
    LOG_EMPTY_OR_PLACEHOLDER: 'POSTFLIGHT_LOG_PLACEHOLDER_OR_EMPTY',
    INDEX_REF_MISSING: 'POSTFLIGHT_INDEX_REFERENCE_MISSING',
    SELF_REF_INVALID: 'POSTFLIGHT_SELF_REF_INVALID',
    RESULT_JSON_INCONSISTENT: 'POSTFLIGHT_RESULT_JSON_INCONSISTENT',
    HEALTHCHECK_MISSING: 'POSTFLIGHT_HEALTHCHECK_MISSING',
    HEALTHCHECK_INVALID: 'POSTFLIGHT_HEALTHCHECK_INVALID',
    // New Gates (v3.9+)
    STATUS_INVALID: 'POSTFLIGHT_STATUS_INVALID',
    INDEX_MISSING_HASH_SIZE: 'POSTFLIGHT_INDEX_MISSING_HASH_SIZE',
    HEALTHCHECK_SUMMARY_MISSING: 'POSTFLIGHT_HEALTHCHECK_SUMMARY_MISSING',
    EMPTY_FILE_FORBIDDEN: 'POSTFLIGHT_EMPTY_FILE_FORBIDDEN',
    LOG_HEAD_INVALID: 'POSTFLIGHT_LOG_HEAD_INVALID',
    RESULT_JSON_TOO_THIN: 'POSTFLIGHT_RESULT_JSON_TOO_THIN',
    // v3.9+ Report Binding
    REPORT_BINDING_MISSING: 'POSTFLIGHT_REPORT_BINDING_MISSING',
    REPORT_BINDING_MISMATCH: 'POSTFLIGHT_REPORT_BINDING_MISMATCH'
};

// --- Utils ---
function parseArgs() {
    const args = process.argv.slice(2);
    const params = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].substring(2);
            const value = args[i + 1];
            params[key] = value;
            i++;
        }
    }
    return params;
}

function fail(report, code, message, details = {}) {
    report.valid = false;
    report.errors.push({ code, message, ...details });
}

function calculateFileHash(filePath) {
    try {
        const fileBuffer = fs.readFileSync(filePath);
        const hashSum = crypto.createHash('sha256');
        hashSum.update(fileBuffer);
        return hashSum.digest('hex');
    } catch (e) {
        return null;
    }
}

// --- Self Test ---
async function runSelfTest(outputFile) {
    console.log('DEBUG ERR Keys:', Object.keys(ERR));
    console.log('DEBUG LOG_HEAD_INVALID:', ERR.LOG_HEAD_INVALID);
    console.log(`[SelfTest] Running v3.9 Contract Tests...`);
    const testDir = path.join(__dirname, '..', 'temp_selftest_v39');
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
    fs.mkdirSync(testDir, { recursive: true });

    const results = [];
    const runTest = async (name, setupFn, expectCode) => {
        const caseDir = path.join(testDir, name);
        fs.mkdirSync(caseDir, { recursive: true });
        setupFn(caseDir);
        
        // Mock process.argv
        const report = { valid: true, errors: [], checks: {} };
        const resultDir = caseDir;
        
        // Execute Validation Logic (Simplified Simulation)
        await validate(caseDir, "M_TEST", report);
        
        const passed = expectCode ? report.errors.some(e => e.code === expectCode) : report.valid;
        const msg = `[${name}] Expect: ${expectCode || 'PASS'} -> Actual: ${report.valid ? 'PASS' : report.errors[0]?.code}`;
        console.log(passed ? `✅ ${msg}` : `❌ ${msg}`);
        if (!passed && !report.valid) console.log('Errors:', JSON.stringify(report.errors, null, 2));
        results.push(passed ? `PASS: ${name}` : `FAIL: ${name}`);
        return passed;
    };

    // Case A: Invalid Status
    await runTest('Case_A_InvalidStatus', (dir) => {
        fs.writeFileSync(path.join(dir, 'result_M_TEST.json'), JSON.stringify({ status: 'success' })); // Invalid
        fs.writeFileSync(path.join(dir, 'notify_M_TEST.txt'), 'RESULT_JSON\nLOG_HEAD\nLOG_TAIL\nINDEX');
        fs.writeFileSync(path.join(dir, 'run_M_TEST.log'), 'x'.repeat(1000));
        fs.writeFileSync(path.join(dir, 'deliverables_index_M_TEST.json'), JSON.stringify({ files: [] }));
        fs.writeFileSync(path.join(dir, 'LATEST.json'), '{}');
    }, ERR.STATUS_INVALID);

    // Case B: Index Missing Hash/Size
    await runTest('Case_B_IndexMissingHashSize', (dir) => {
        fs.writeFileSync(path.join(dir, 'result_M_TEST.json'), JSON.stringify({ status: 'DONE' }));
        fs.writeFileSync(path.join(dir, 'notify_M_TEST.txt'), 'RESULT_JSON\nLOG_HEAD\nLOG_TAIL\nINDEX');
        fs.writeFileSync(path.join(dir, 'run_M_TEST.log'), 'x'.repeat(1000));
        fs.writeFileSync(path.join(dir, 'test.txt'), 'content');
        fs.writeFileSync(path.join(dir, 'deliverables_index_M_TEST.json'), JSON.stringify({ 
            files: [{ name: 'test.txt' }] // Missing size/hash
        }));
        fs.writeFileSync(path.join(dir, 'LATEST.json'), '{}');
    }, ERR.INDEX_MISSING_HASH_SIZE);

    // Case C: Healthcheck Summary Missing
    await runTest('Case_C_HealthcheckSummaryMissing', (dir) => {
        fs.writeFileSync(path.join(dir, 'result_M_TEST.json'), JSON.stringify({ status: 'DONE' }));
        fs.writeFileSync(path.join(dir, 'notify_M_TEST.txt'), 'RESULT_JSON\nLOG_HEAD\nLOG_TAIL\nINDEX'); // Missing summary
        fs.writeFileSync(path.join(dir, 'run_M_TEST.log'), 'arb-validate-web'); // Trigger domain check
        fs.writeFileSync(path.join(dir, 'healthcheck.txt'), '/ -> 200\n/pairs -> 200');
        fs.writeFileSync(path.join(dir, 'ui_copy_details.json'), '{}');
        fs.writeFileSync(path.join(dir, 'deliverables_index_M_TEST.json'), JSON.stringify({ 
            files: [
                { name: 'healthcheck.txt', size: 20, sha256_short: '12345678' },
                { name: 'ui_copy_details.json', size: 2, sha256_short: '12345678' }
            ] 
        }));
        fs.writeFileSync(path.join(dir, 'LATEST.json'), '{}');
    }, ERR.HEALTHCHECK_SUMMARY_MISSING);

    // Case D: Full Envelope Pass (v3.9+)
    await runTest('Case_D_FullEnvelopePass', (dir) => {
        // Calculate hash for notify file first
        const notifyContent = 'RESULT_JSON\nLOG_HEAD\nValid Log Head Content...\nLOG_TAIL\nINDEX\n/ -> 200 OK\n/pairs -> 200 OK';
        const hashSum = crypto.createHash('sha256');
        hashSum.update(notifyContent);
        const notifyShaShort = hashSum.digest('hex').substring(0, 8);

        fs.writeFileSync(path.join(dir, 'result_M_TEST.json'), JSON.stringify({ 
            status: 'DONE', 
            summary: 'Valid summary with enough length.',
            report_file: 'notify_M_TEST.txt',
            report_sha256_short: notifyShaShort
        }));
        fs.writeFileSync(path.join(dir, 'notify_M_TEST.txt'), notifyContent);
        fs.writeFileSync(path.join(dir, 'run_M_TEST.log'), 'arb-validate-web ' + 'x'.repeat(1000));
        fs.writeFileSync(path.join(dir, 'healthcheck.txt'), '/ -> 200\n/pairs -> 200');
        fs.writeFileSync(path.join(dir, 'ui_copy_details.json'), '{}');
        fs.writeFileSync(path.join(dir, 'deliverables_index_M_TEST.json'), JSON.stringify({ 
            files: [
                { name: 'healthcheck.txt', size: 20, sha256_short: '12345678' },
                { name: 'ui_copy_details.json', size: 2, sha256_short: '12345678' }
            ] 
        }));
        fs.writeFileSync(path.join(dir, 'LATEST.json'), '{}');
    }, null);

    // Case E: Lazy LOG_HEAD
    await runTest('Case_E_LogHeadLazy', (dir) => {
        fs.writeFileSync(path.join(dir, 'result_M_TEST.json'), JSON.stringify({ status: 'DONE', summary: 'Valid summary.' }));
        fs.writeFileSync(path.join(dir, 'notify_M_TEST.txt'), 'RESULT_JSON\nLOG_HEAD\nSee run.log\nLOG_TAIL\nINDEX');
        fs.writeFileSync(path.join(dir, 'run_M_TEST.log'), 'x'.repeat(1000));
        fs.writeFileSync(path.join(dir, 'deliverables_index_M_TEST.json'), JSON.stringify({ files: [] }));
        fs.writeFileSync(path.join(dir, 'LATEST.json'), '{}');
    }, ERR.LOG_HEAD_INVALID);

    // Case F: Result JSON Too Thin
    await runTest('Case_F_ResultJsonThin', (dir) => {
        fs.writeFileSync(path.join(dir, 'result_M_TEST.json'), JSON.stringify({ status: 'DONE' })); // No summary
        fs.writeFileSync(path.join(dir, 'notify_M_TEST.txt'), 'RESULT_JSON\nLOG_HEAD\nValid Content\nLOG_TAIL\nINDEX');
        fs.writeFileSync(path.join(dir, 'run_M_TEST.log'), 'x'.repeat(1000));
        fs.writeFileSync(path.join(dir, 'deliverables_index_M_TEST.json'), JSON.stringify({ files: [] }));
        fs.writeFileSync(path.join(dir, 'LATEST.json'), '{}');
    }, ERR.RESULT_JSON_TOO_THIN);

    const summary = results.join('\n');
    if (outputFile) fs.writeFileSync(outputFile, summary);
    console.log(summary);
    
    // Clean up
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch(e) {}
}

// --- Validation Logic (Extracted for reuse) ---
async function validate(resultDir, taskId, report) {
    // 1. Artifact Existence Check
    const artifacts = {
        result: `result_${taskId}.json`,
        notify: `notify_${taskId}.txt`,
        log: `run_${taskId}.log`,
        index: `deliverables_index_${taskId}.json`,
        latest: `LATEST.json`
    };
    
    const findFile = (preferred, fallback) => {
        if (fs.existsSync(path.join(resultDir, preferred))) return preferred;
        if (fallback && fs.existsSync(path.join(resultDir, fallback))) return fallback;
        return null;
    };

    const found = {
        result: findFile(artifacts.result, 'result.json'),
        notify: findFile(artifacts.notify, 'notify.txt'),
        log: findFile(artifacts.log, 'run.log'),
        index: findFile(artifacts.index, 'deliverables_index.json'),
        latest: findFile(artifacts.latest, null)
    };

    report.checks.artifacts = found;

    if (!found.result) fail(report, ERR.MISSING_ARTIFACT, `Missing result json`, { expected: artifacts.result });
    if (!found.notify) fail(report, ERR.MISSING_ARTIFACT, `Missing notify txt`, { expected: artifacts.notify });
    if (!found.log) fail(report, ERR.MISSING_ARTIFACT, `Missing run log`, { expected: artifacts.log });
    if (!found.index) fail(report, ERR.MISSING_ARTIFACT, `Missing deliverables index`, { expected: artifacts.index });
    if (!found.latest) fail(report, ERR.MISSING_ARTIFACT, `Missing LATEST.json`);

    // Stop if critical artifacts missing
    if (!report.valid && !found.result && !found.index) return;

    // --- GATE A: Status Contract ---
    let resultData = {};
    if (found.result) {
        try {
            resultData = JSON.parse(fs.readFileSync(path.join(resultDir, found.result), 'utf8'));
            const status = (resultData.status || '').toUpperCase();
            if (status !== 'DONE' && status !== 'FAILED') {
                fail(report, ERR.STATUS_INVALID, `Status must be DONE or FAILED, found: ${resultData.status}`);
            }
            // Check Summary
            if (!resultData.summary || typeof resultData.summary !== 'string' || resultData.summary.trim().length < 5) {
                fail(report, ERR.RESULT_JSON_TOO_THIN, `RESULT_JSON must contain a meaningful 'summary' field (>= 5 chars).`);
            }

            // --- GATE: Report Binding (v3.9+) ---
            // 1. Check existence of fields
            if (!resultData.report_file || !resultData.report_sha256_short) {
                fail(report, ERR.REPORT_BINDING_MISSING, `RESULT_JSON must contain 'report_file' and 'report_sha256_short' to bind the report.`);
            } else {
                // 2. Check file existence
                // Handle case where report_file might be relative or absolute (but inside resultDir usually)
                // We expect it to be a filename in the resultDir
                const reportFilePath = path.join(resultDir, resultData.report_file);
                if (!fs.existsSync(reportFilePath)) {
                    fail(report, ERR.REPORT_BINDING_MISSING, `Report file specified in RESULT_JSON not found: ${resultData.report_file}`);
                } else {
                    // 3. Check SHA match
                    const realSha = calculateFileHash(reportFilePath);
                    const realShaShort = realSha ? realSha.substring(0, 8) : null;
                    if (realShaShort !== resultData.report_sha256_short) {
                         fail(report, ERR.REPORT_BINDING_MISMATCH, `Report file SHA mismatch. Claimed: ${resultData.report_sha256_short}, Actual: ${realShaShort}`);
                    }
                }
            }
            
            // Optional: Validator Binding
            if (resultData.postflight_validator_sha256_short) {
                 const selfPath = __filename;
                 const selfSha = calculateFileHash(selfPath);
                 const selfShaShort = selfSha ? selfSha.substring(0, 8) : null;
                 if (selfShaShort && selfShaShort !== resultData.postflight_validator_sha256_short) {
                     // Warn or fail? User said: "若加了也要校验它匹配文件真实 sha"
                     fail(report, ERR.REPORT_BINDING_MISMATCH, `Validator SHA mismatch. Claimed: ${resultData.postflight_validator_sha256_short}, Actual: ${selfShaShort}`);
                 }
            }

        } catch (e) {
            fail(report, ERR.RESULT_JSON_INCONSISTENT, `Invalid JSON in result: ${e.message}`);
        }
    }

    // 2. Notify Full Envelope Check
    if (found.notify) {
        const notifyContent = fs.readFileSync(path.join(resultDir, found.notify), 'utf8');
        const hasResultJson = notifyContent.includes('RESULT_JSON');
        const hasLogHead = notifyContent.includes('LOG_HEAD');
        const hasLogTail = notifyContent.includes('LOG_TAIL');
        const hasIndex = notifyContent.includes('INDEX');

        report.checks.envelope = { hasResultJson, hasLogHead, hasLogTail, hasIndex };

        if (!hasResultJson || !hasLogHead || !hasLogTail || !hasIndex) {
            fail(report, ERR.ENVELOPE_MISSING, `Notify missing envelope sections`, { missing: { 
                RESULT_JSON: !hasResultJson, LOG_HEAD: !hasLogHead, LOG_TAIL: !hasLogTail, INDEX: !hasIndex 
            }});
        } else {
            // Check LOG_HEAD content
            const logHeadMatch = notifyContent.match(/LOG_HEAD([\s\S]*?)(?:LOG_TAIL|INDEX|$)/);
            if (logHeadMatch) {
                const logHeadContent = logHeadMatch[1].trim();
                // Ban "See run.log", "Padding line", or extremely short content
                if (logHeadContent.length < 5 || 
                    /see\s+run\.log/i.test(logHeadContent) || 
                    /see\s+attached/i.test(logHeadContent) ||
                    /padding\s+line/i.test(logHeadContent)) {
                     fail(report, ERR.LOG_HEAD_INVALID, `LOG_HEAD content is too thin or contains padding/lazy references. Must contain actual log excerpt.`);
                }
            }
        }
        
        // Check Healthcheck Summary in Notify (v3.9+)
        const healthcheckPattern1 = /\/\s*->\s*200/i; // / -> 200
        const healthcheckPattern2 = /\/pairs\s*->\s*200/i; // /pairs -> 200
        if (!healthcheckPattern1.test(notifyContent) || !healthcheckPattern2.test(notifyContent)) {
             fail(report, ERR.HEALTHCHECK_SUMMARY_MISSING, `Notify must contain Healthcheck summary lines: '/ -> 200' and '/pairs -> 200'`);
        }
    }

    // 3. Evidence Quality (Log)
    if (found.log) {
        const logPath = path.join(resultDir, found.log);
        const stats = fs.statSync(logPath);
        const logContent = fs.readFileSync(logPath, 'utf8');

        report.checks.log = { size: stats.size, isPlaceholder: false };

        if (stats.size < LOG_MIN_SIZE_BYTES) {
            fail(report, ERR.LOG_EMPTY_OR_PLACEHOLDER, `Log too small (${stats.size} bytes < ${LOG_MIN_SIZE_BYTES})`);
        }

        if (logContent.includes(PLACEHOLDER_LOG_TEXT)) {
            report.checks.log.isPlaceholder = true;
            fail(report, ERR.LOG_EMPTY_OR_PLACEHOLDER, `Log contains placeholder text`);
        }
    }

    // 4. Index Consistency & GATE B: Hash/Size Contract
    if (found.index) {
        const indexPath = path.join(resultDir, found.index);
        let indexData;
        try {
            indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
            report.checks.index = { parsed: true, file_count: indexData.files?.length || 0, failures: [] };
            
            const missingHashFiles = [];
            const enrichedFiles = [];

            if (Array.isArray(indexData.files)) {
                for (const file of indexData.files) {
                    const fname = file.name || file.path; // Support both
                    
                    // Check Hash/Size
                    if (!file.size || !file.sha256_short || file.sha256_short.length < 8) {
                        missingHashFiles.push(fname);
                        
                        // Attempt Enrichment
                        const fpath = path.join(resultDir, fname);
                        if (fs.existsSync(fpath)) {
                            const stats = fs.statSync(fpath);
                            const hash = calculateFileHash(fpath);
                            enrichedFiles.push({
                                ...file,
                                size: stats.size,
                                sha256_short: hash ? hash.substring(0, 8) : 'ERROR'
                            });
                        } else {
                            enrichedFiles.push(file);
                        }
                    } else {
                        enrichedFiles.push(file);
                    }

                    // v3.9 Rule: Empty Files Forbidden
                    if (file.size === 0 || file.error || file.sha256_short === 'EMPTY_FILE') {
                         fail(report, ERR.EMPTY_FILE_FORBIDDEN, `Indexed file is empty or flagged as invalid: ${fname}`);
                    }

                    const fpath = path.join(resultDir, fname);
                    if (!fs.existsSync(fpath)) {
                        report.checks.index.failures.push(fname);
                        fail(report, ERR.INDEX_REF_MISSING, `Indexed file not found on disk: ${fname}`);
                    }
                }

                if (missingHashFiles.length > 0) {
                    fail(report, ERR.INDEX_MISSING_HASH_SIZE, `Index items missing size or sha256_short: ${missingHashFiles.slice(0, 20).join(', ')}`);
                    // Generate enriched index
                    fs.writeFileSync(path.join(resultDir, 'deliverables_index_enriched.json'), JSON.stringify({ files: enrichedFiles }, null, 2));
                }
            }
        } catch (e) {
            fail(report, ERR.RESULT_JSON_INCONSISTENT, `Invalid JSON in deliverables index: ${e.message}`);
        }
    }

    // 5. Domain Specific Checks (Arb Validate Web Healthcheck)
    if (found.log && found.index) {
        const logPath = path.join(resultDir, found.log);
        const logContent = fs.readFileSync(logPath, 'utf8');
        
        const triggers = [
            /cd\s+.*arb-validate-web/i,
            /healthcheck_http_v1\.mjs/,
            /localhost:53121/,
            /arb-validate-web/i,
            /\/api\/pairs\/auto-match\/stream/,
            /manual_capture_sse_autmatch/,
            /pairs-client/,
            /Copy Details/
        ];
        
        const isArbWebTask = triggers.some(t => t.test(logContent));
        
        if (isArbWebTask) {
            report.checks.domain = { isArbWeb: true, healthcheckFound: false };
            
            const indexPath = path.join(resultDir, found.index);
            let indexData;
            try { indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8')); } catch (e) {}

            if (indexData && Array.isArray(indexData.files)) {
                const healthcheckFile = indexData.files.find(f => 
                    (f.name || f.path).includes('healthcheck') && ((f.name || f.path).endsWith('.txt') || (f.name || f.path).endsWith('.json'))
                );
                
                if (!healthcheckFile) {
                    fail(report, ERR.HEALTHCHECK_MISSING, `缺少 healthcheck 证据（/ 与 /pairs 必须 200）`);
                } else {
                    const hcPath = path.join(resultDir, healthcheckFile.name || healthcheckFile.path);
                    if (fs.existsSync(hcPath)) {
                        const hcContent = fs.readFileSync(hcPath, 'utf8');
                        const hasRoot = hcContent.includes('/ -> 200');
                        const hasPairs = hcContent.includes('/pairs -> 200');
                        
                        report.checks.domain.healthcheckFound = true;
                        
                        if (!hasRoot || !hasPairs) {
                            fail(report, ERR.HEALTHCHECK_INVALID, `Healthcheck 证据不合格：/ 与 /pairs 必须 200`);
                        }
                    }
                }

                // GATE C: Healthcheck Summary in Report Body
                if (found.notify) {
                    const notifyContent = fs.readFileSync(path.join(resultDir, found.notify), 'utf8');
                    const hasRootSummary = notifyContent.match(/\/ -> 200/);
                    const hasPairsSummary = notifyContent.match(/\/pairs -> 200/);
                    
                    if (!hasRootSummary || !hasPairsSummary) {
                        fail(report, ERR.HEALTHCHECK_SUMMARY_MISSING, `回报正文必须摘录 Healthcheck 关键行：/ -> 200 和 /pairs -> 200`);
                    }
                }

                // Evidence Envelope Check
                const evidenceFiles = indexData.files.filter(f => {
                    const n = f.name || f.path;
                    return n.match(/ui_copy_details.*\.json/) || 
                           n.match(/sse_capture.*\.out/) || 
                           n === 'manual_verification.json';
                });

                if (evidenceFiles.length === 0) {
                    fail(report, 'POSTFLIGHT_EVIDENCE_ENVELOPE_MISSING', `Missing Business Evidence: 必须包含 ui_copy_details*.json / sse_capture*.out / manual_verification.json 其中之一`);
                }

                // GATE D: AutoMatch Specific Metrics (v3.9+ Strict)
                // If this is an AutoMatch task (detected by log content), we require specific metrics in the report body
                if (logContent.match(/AutoMatch|auto-match|candidate_count/i)) {
                    const notifyContent = fs.readFileSync(path.join(resultDir, found.notify), 'utf8');
                    const hasPmEvents = /pm_events_count\s*[:=]\s*\d+/i.test(notifyContent) || /pm_events_count/i.test(notifyContent);
                    const hasCandidates = /candidate_count\s*[:=]\s*\d+/i.test(notifyContent) || /candidate_count/i.test(notifyContent);
                    
                    if (!hasPmEvents || !hasCandidates) {
                         fail(report, 'POSTFLIGHT_AUTOMATCH_METRICS_MISSING', `AutoMatch 任务必须在回报正文汇报 pm_events_count 和 candidate_count`);
                    }
                }
            }
        }
    }
}

// --- Main ---
async function main() {
    const args = parseArgs();
    
    if (args.selftest_v39_contract) {
        await runSelfTest(args.out);
        return;
    }

    const taskId = args.task_id;
    const resultDir = args.result_dir;
    
    // Default report dir: ../../reports/postflight relative to resultDir (assuming resultDir is in results/)
    // Or pass via arg
    // But resultDir might be absolute.
    // Let's assume standard layout: ROOT/results/<id> -> ROOT/reports/postflight
    let reportDir = args.report_dir;
    if (!reportDir && resultDir) {
        // Try to deduce
        const rootDir = path.dirname(path.dirname(resultDir)); // up results, up traeback? No, resultDir is traeback/results/task_id. dirname is traeback/results. dirname(dirname) is traeback.
        // Wait, resultDir = .../results/task_id
        // path.dirname(resultDir) = .../results
        // path.dirname(...) = .../traeback
        reportDir = path.join(path.dirname(path.dirname(resultDir)), 'reports', 'postflight');
    }

    if (!taskId || !resultDir) {
        console.error("Usage: node postflight_validate_envelope.mjs --task_id <id> --result_dir <path> [--report_dir <path>]");
        process.exit(1);
    }

    const report = {
        task_id: taskId,
        timestamp: new Date().toISOString(),
        valid: true,
        errors: [],
        checks: {}
    };

    console.log(`[Postflight] Validating ${taskId} in ${resultDir}...`);

    try {
        await validate(resultDir, taskId, report);
    } catch (e) {
        fail(report, 'INTERNAL_ERROR', `Postflight script crash: ${e.message}`);
    }

    // Write Report
    if (reportDir) {
        if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
        const reportPath = path.join(reportDir, `${taskId}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        console.log(`[Postflight] Report saved to: ${reportPath}`);
    } else {
        console.log(JSON.stringify(report, null, 2));
    }

    if (report.valid) {
        console.log(`[Postflight] PASS`);
        process.exit(0);
    } else {
        console.error(`[Postflight] FAIL: ${report.errors.length} errors found.`);
        report.errors.forEach(e => console.error(` - [${e.code}] ${e.message}`));
        process.exit(1);
    }
}

main();
