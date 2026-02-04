
import fs from 'fs';
import path from 'path';

// --- Configuration ---
const ARGS = process.argv.slice(2);
const getArg = (name: string, defaultVal: string) => {
    const idx = ARGS.indexOf(name);
    return idx !== -1 && ARGS[idx + 1] ? ARGS[idx + 1] : defaultVal;
};

const CONFIG = {
    inputFile: getArg('--in', ''),
    outputDir: path.join(process.cwd(), 'reports')
};

// --- Types ---
interface FillRecord {
    pair_id: string;
    p_fill_est: number;
    ttf_p50: number;
    filled: number; // 0 or 1
    ttf: number; // Actual TTF
    reason: string;
}

// --- Main ---
async function main() {
    console.log(`\n=== Real Fill Calibration ===`);
    
    if (!CONFIG.inputFile) {
        console.error(`[Error] Please provide input file via --in`);
        console.error(`Example: npm run real:calibrate -- --in reports/real_fill_candidates_....csv`);
        process.exit(1);
    }

    const fullPath = path.isAbsolute(CONFIG.inputFile) ? CONFIG.inputFile : path.join(process.cwd(), CONFIG.inputFile);
    
    if (!fs.existsSync(fullPath)) {
        console.error(`[Error] File not found: ${fullPath}`);
        process.exit(1);
    }

    console.log(`Loading: ${fullPath}`);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    
    if (lines.length < 2) {
        console.error(`[Error] CSV is empty or invalid.`);
        process.exit(1);
    }

    const header = lines[0].split(',').map(h => h.trim());
    const idx = {
        p_fill: header.indexOf('p_fill_est'),
        ttf_p50: header.indexOf('ttf_p50'),
        filled: header.indexOf('filled'),
        ttf: header.indexOf('ttf'),
        reason: header.indexOf('reason')
    };

    if (idx.filled === -1) {
        console.error(`[Error] CSV missing 'filled' column.`);
        process.exit(1);
    }

    const records: FillRecord[] = [];
    
    // Parse Rows
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim());
        if (cols.length < header.length) continue;

        const filledRaw = cols[idx.filled];
        if (filledRaw === '' || filledRaw === undefined) continue; // Skip unlabelled rows

        records.push({
            pair_id: cols[0],
            p_fill_est: parseFloat(cols[idx.p_fill] || '0'),
            ttf_p50: parseFloat(cols[idx.ttf_p50] || '0'),
            filled: parseInt(filledRaw, 10),
            ttf: parseFloat(cols[idx.ttf] || '0'),
            reason: cols[idx.reason] || ''
        });
    }

    if (records.length === 0) {
        console.warn(`[Warn] No labelled records found (check 'filled' column).`);
        return;
    }

    console.log(`Analyzed Records: ${records.length}`);

    // --- Metrics ---

    // 1. P_Fill Calibration (Buckets)
    const buckets = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
    const calibrationStats = [];

    console.log(`\n--- Calibration: Predicted vs Actual ---`);
    console.log(`Bucket       | Count | Avg Pred | Actual Rate | Bias`);
    console.log(`-------------|-------|----------|-------------|-----`);

    for (let i = 0; i < buckets.length - 1; i++) {
        const min = buckets[i];
        const max = buckets[i+1];
        const subset = records.filter(r => r.p_fill_est >= min && r.p_fill_est < max);
        
        if (subset.length > 0) {
            const avgPred = subset.reduce((a, b) => a + b.p_fill_est, 0) / subset.length;
            const avgActual = subset.reduce((a, b) => a + b.filled, 0) / subset.length;
            const bias = avgPred - avgActual;
            
            calibrationStats.push({ bucket: `${min}-${max}`, count: subset.length, avgPred, avgActual, bias });
            
            console.log(
                `${min.toFixed(1)}-${max.toFixed(1)}      | ` +
                `${subset.length.toString().padEnd(5)} | ` +
                `${avgPred.toFixed(2).padEnd(8)} | ` +
                `${avgActual.toFixed(2).padEnd(11)} | ` +
                `${bias > 0 ? '+' : ''}${bias.toFixed(2)}`
            );
        }
    }

    // 2. TTF Analysis (Only for filled orders)
    const filledOrders = records.filter(r => r.filled === 1 && r.ttf > 0);
    let ttfStats = { p50_error: 0, p90_error: 0, count: 0 };
    
    if (filledOrders.length > 0) {
        const errors = filledOrders.map(r => r.ttf - r.ttf_p50).sort((a, b) => a - b);
        const p50Idx = Math.floor(errors.length * 0.5);
        const p90Idx = Math.floor(errors.length * 0.9);
        
        ttfStats = {
            count: filledOrders.length,
            p50_error: errors[p50Idx],
            p90_error: errors[p90Idx]
        };

        console.log(`\n--- TTF Accuracy (Filled Only) ---`);
        console.log(`Count: ${filledOrders.length}`);
        console.log(`Median Error (Actual - Pred): ${ttfStats.p50_error.toFixed(0)} ms`);
        console.log(`P90 Error: ${ttfStats.p90_error.toFixed(0)} ms`);
    }

    // 3. Fail Reasons
    const failedOrders = records.filter(r => r.filled === 0);
    const reasons: Record<string, number> = {};
    failedOrders.forEach(r => {
        const k = r.reason || 'Unknown';
        reasons[k] = (reasons[k] || 0) + 1;
    });

    console.log(`\n--- Fail Reasons ---`);
    Object.entries(reasons).forEach(([k, v]) => {
        console.log(`- ${k}: ${v}`);
    });

    // --- Output JSON ---
    const report = {
        meta: { timestamp: new Date().toISOString(), input: CONFIG.inputFile },
        calibration: calibrationStats,
        ttf: ttfStats,
        reasons
    };

    const outName = `real_fill_calibration_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const outPath = path.join(CONFIG.outputDir, outName);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    
    console.log(`\n[Success] Report saved to: ${outPath}`);
}

main().catch(console.error);
