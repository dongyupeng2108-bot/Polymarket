
import fs from 'fs';
import path from 'path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    mode: { type: 'string' },
    out: { type: 'string' },
    sse_file: { type: 'string' }
  },
});

const outFile = values.out || 'ui_copy_details_completed.json';
const sseFile = values.sse_file || 'sse_capture_auto_limit50.out';

console.log(`[Simulate Copy] Generating Copy Details...`);
console.log(`Output: ${outFile}`);

let copyData = {
    request_id: "REQ_MOCK_12345",
    ts: Date.now(),
    scan_summary: {
        scanned: 50,
        matched: 12,
        added: 5,
        existing: 7,
        failed: 0,
        skipped: 38
    },
    universe_mode: "search_keywords (auto-switched)",
    active_keywords: ["crypto", "bitcoin", "election", "politics", "fed"],
    active_prefixes: [],
    domain_mismatch: {
        is_mismatch: true,
        reason: "Sports dominance: 85.0% -> Triggering Auto-Switch",
        confidence: 0.88
    },
    advice: "Auto-switched to search_keywords mode. If still no matches, consider using specific prefixes.",
    debug_context: {
        kalshi_url: "https://api.elections.kalshi.com/trade-api/v2",
        pm_hints: ["crypto", "bitcoin", "election"]
    }
};

// Try to read real data from SSE capture if available
if (fs.existsSync(sseFile)) {
    console.log(`Reading SSE file: ${sseFile}`);
    const content = fs.readFileSync(sseFile, 'utf-8');
    const lines = content.split('\n');
    
    let completeData = null;
    let lastDebug = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('event: complete')) {
            if (i + 1 < lines.length && lines[i+1].startsWith('data: ')) {
                try {
                    completeData = JSON.parse(lines[i+1].substring(6));
                } catch (e) {
                    console.warn('Failed to parse complete data', e);
                }
            }
        }
        if (line.startsWith('data: ')) {
             try {
                const d = JSON.parse(line.substring(6));
                if (d.debug) lastDebug = d.debug;
             } catch (e) {}
        }
    }

    if (completeData) {
        copyData.request_id = completeData.request_id;
        copyData.ts = completeData.ts;
        copyData.scan_summary = completeData.summary;
        if (lastDebug) {
             copyData.universe_mode = lastDebug.kalshi_fetch?.universe_mode || 'unknown';
             copyData.active_keywords = lastDebug.kalshi_fetch?.auto_switch_keywords || lastDebug.kalshi_fetch?.keywords || [];
             copyData.active_prefixes = lastDebug.kalshi_fetch?.prefixes || [];
             copyData.domain_mismatch = lastDebug.domain_mismatch_guess;
             copyData.advice = lastDebug.advice;
             copyData.debug_context = {
                 kalshi_url: lastDebug.kalshi_fetch?.base_url,
                 pm_hints: Object.keys(lastDebug.pm_topic_hint_top10 || {})
             };
        }
    }
}

fs.writeFileSync(outFile, JSON.stringify(copyData, null, 2));
console.log(`[Simulate Copy] Success. Written to ${outFile}`);
