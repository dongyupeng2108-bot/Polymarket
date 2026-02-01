
import fs from 'fs';
import path from 'path';

interface AnalysisResult {
    file: string;
    mode: string;
    total_markets: number;
    top1_prefix: string;
    top1_count: number;
    top1_share: number;
    request_id: string;
    debug_top10: Record<string, number>;
}

function analyzeFile(filePath: string): AnalysisResult | null {
    if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    let lastDebugData: any = null;
    let requestId = '';

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('data: ')) {
            try {
                const data = JSON.parse(line.substring(6));
                if (data.request_id) requestId = data.request_id;
                if (data.debug) {
                    lastDebugData = data.debug;
                }
            } catch (e) {}
        }
    }

    if (!lastDebugData) {
        console.error(`No debug data found in ${filePath}`);
        return null;
    }

    const top10 = lastDebugData.kh_prefix_counts_top10 || {};
    // Sort to find top 1
    const sortedPrefixes = Object.entries(top10).sort((a: any, b: any) => b[1] - a[1]);
    
    let top1Prefix = 'N/A';
    let top1Count = 0;
    
    if (sortedPrefixes.length > 0) {
        top1Prefix = sortedPrefixes[0][0];
        top1Count = sortedPrefixes[0][1] as number;
    }

    // Use kalshi_markets_count from debug, or sum of top10 as a fallback proxy (though less accurate)
    // The user mentioned debug.kalshi_markets_count
    let total = lastDebugData.kalshi_markets_count || 0;
    
    // Fallback if total is 0 but we have counts (e.g. limit was hit before counting all?)
    // Actually kalshi_markets_count usually represents the total available or fetched. 
    // If it's 0, maybe we can use scanned?
    if (total === 0 && lastDebugData.scanned) {
        total = lastDebugData.scanned;
    }

    return {
        file: path.basename(filePath),
        mode: lastDebugData.kalshi_fetch?.universe_mode || 'unknown',
        total_markets: total,
        top1_prefix: top1Prefix,
        top1_count: top1Count,
        top1_share: total > 0 ? top1Count / total : 0,
        request_id: requestId,
        debug_top10: top10
    };
}

function main() {
    const files = [
        'sse_capture_public_limit50.out',
        'sse_capture_search_limit50.out',
        'sse_capture_auto_limit50.out'
    ];

    const results: Record<string, AnalysisResult> = {};

    console.log("=== SPORTS DOMINANCE ANALYSIS ===");
    
    for (const f of files) {
        const res = analyzeFile(f);
        if (res) {
            results[f] = res;
            console.log(`\nAnalyzed ${f}:`);
            console.log(`  Mode: ${res.mode}`);
            console.log(`  Request ID: ${res.request_id}`);
            console.log(`  Total Markets: ${res.total_markets}`);
            console.log(`  Top1 Prefix: ${res.top1_prefix} (${res.top1_count})`);
            console.log(`  Share: ${(res.top1_share * 100).toFixed(1)}%`);
        }
    }

    // Comparison Logic
    const baseline = results['sse_capture_public_limit50.out'];
    const search = results['sse_capture_search_limit50.out'];

    if (baseline && search) {
        console.log("\n=== COMPARISON: Baseline vs Search ===");
        const delta = baseline.top1_share - search.top1_share;
        console.log(`Baseline Share: ${(baseline.top1_share * 100).toFixed(1)}%`);
        console.log(`Search Share: ${(search.top1_share * 100).toFixed(1)}%`);
        console.log(`Delta (Reduction): ${(delta * 100).toFixed(1)}%`);

        let effective = false;
        let reason = "";

        // Criteria: Reduction >= 0.20 OR Share < 0.60
        if (delta >= 0.20) {
            effective = true;
            reason = `Reduction (${(delta * 100).toFixed(1)}%) >= 20%`;
        } else if (search.top1_share < 0.60) {
            effective = true;
            reason = `Search Share (${(search.top1_share * 100).toFixed(1)}%) < 60%`;
        } else {
            reason = "Reduction < 20% and Share >= 60%";
        }

        console.log(`\nCONCLUSION: ${effective ? 'EFFECTIVE' : 'INEFFECTIVE'}`);
        console.log(`Reason: ${reason}`);
        
        // Output JSON for result
        const output = {
            baseline_top1_share: baseline.top1_share,
            search_top1_share: search.top1_share,
            delta: delta,
            conclusion: effective ? 'EFFECTIVE' : 'INEFFECTIVE',
            reason: reason,
            details: results
        };
        
        fs.writeFileSync('analysis_dominance_result.json', JSON.stringify(output, null, 2));
    } else {
        console.log("\nCannot compare: missing baseline or search results.");
    }
}

main();
