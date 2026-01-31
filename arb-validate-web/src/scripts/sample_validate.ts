
import fs from 'fs';
import path from 'path';

// Types (simplified from API response)
interface ScanResponse {
    ok: boolean;
    scanned: number;
    results: any[];
    summary: any;
}

interface ScanResult {
    id: number;
    pairId: number;
    timestamp: string;
    result: string; // OPPORTUNITY, NO_OPPORTUNITY, ERROR
    reason_code?: string;
    reason?: string;
    simulation?: {
        tradeable: boolean;
        expected_profit: number | null;
        net_edge: number | null;
        quality_score?: number;
        quality_tags?: string[];
        components?: {
            reason?: string;
        }
    };
    debug_stats?: any;
}

async function main() {
    // 1. Parse Args
    const args = process.argv.slice(2);
    const getArg = (name: string, defaultVal: string) => {
        const idx = args.indexOf(name);
        return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
    };

    const loops = parseInt(getArg('--loops', '50'), 10);
    const intervalMs = parseInt(getArg('--interval_ms', '2000'), 10);
    const minQuality = parseInt(getArg('--min_quality', '60'), 10);
    const eventTicker = getArg('--eventTicker', 'GT'); // Default to GT if not provided

    console.log(`[Sample] Starting validation: loops=${loops}, interval=${intervalMs}ms, ticker=${eventTicker}`);

    const results: ScanResult[] = [];
    const summaryStats = {
        total_scans: 0,
        success_calls: 0,
        failed_calls: 0
    };

    const apiUrl = 'http://localhost:53121/api/scan/batch';

    // 2. Loop
    for (let i = 0; i < loops; i++) {
        process.stdout.write(`\r[${i + 1}/${loops}] Scanning... `);
        
        try {
            const res = await fetch(`${apiUrl}?eventTicker=${eventTicker}&limit=100`, {
                method: 'POST'
            });

            if (!res.ok) {
                console.error(`\nHTTP Error: ${res.status}`);
                summaryStats.failed_calls++;
                continue;
            }

            const data = await res.json() as ScanResponse;
            summaryStats.success_calls++;
            
            if (data.results) {
                results.push(...data.results);
            }

        } catch (e: any) {
            console.error(`\nFetch Error: ${e.message}`);
            summaryStats.failed_calls++;
        }

        if (i < loops - 1) {
            await new Promise(r => setTimeout(r, intervalMs));
        }
    }

    console.log('\n[Sample] Sampling complete. Processing results...');

    // 3. Process Data
    const validSims = results.filter(r => r.simulation);
    const tradeable = validSims.filter(r => r.simulation?.tradeable);
    
    // M2: Quality Filtered set
    const qualityHits = tradeable.filter(r => (r.simulation?.quality_score || 0) >= minQuality);

    const profits = tradeable
        .map(r => r.simulation?.expected_profit || 0)
        .sort((a, b) => a - b);
    
    const p50 = profits.length > 0 ? profits[Math.floor(profits.length * 0.5)] : 0;
    const p90 = profits.length > 0 ? profits[Math.floor(profits.length * 0.9)] : 0;
    const avgProfit = profits.length > 0 ? profits.reduce((a, b) => a + b, 0) / profits.length : 0;
    const minProfitVal = profits.length > 0 ? profits[0] : 0;
    const maxProfitVal = profits.length > 0 ? profits[profits.length - 1] : 0;

    // Quality Stats
    const qualityScores = tradeable
        .map(r => r.simulation?.quality_score || 0)
        .sort((a, b) => a - b);
    
    const qP50 = qualityScores.length > 0 ? qualityScores[Math.floor(qualityScores.length * 0.5)] : 0;
    const qP90 = qualityScores.length > 0 ? qualityScores[Math.floor(qualityScores.length * 0.9)] : 0;
    const qAvg = qualityScores.length > 0 ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : 0;
    const qMin = qualityScores.length > 0 ? qualityScores[0] : 0;
    const qMax = qualityScores.length > 0 ? qualityScores[qualityScores.length - 1] : 0;

    // Hit Rate
    const hitRate = results.length > 0 ? (tradeable.length / results.length) : 0;
    const qualityHitRate = results.length > 0 ? (qualityHits.length / results.length) : 0;

    // Top Opportunities by Profit
    const topByProfit = tradeable
        .sort((a, b) => (b.simulation?.expected_profit || 0) - (a.simulation?.expected_profit || 0))
        .slice(0, 10)
        .map(r => ({
            pairId: r.pairId,
            timestamp: r.timestamp,
            profit: r.simulation?.expected_profit,
            quality: r.simulation?.quality_score,
            tags: r.simulation?.quality_tags || []
        }));
        
    // Top Opportunities by Quality
    const topByQuality = tradeable
        .sort((a, b) => (b.simulation?.quality_score || 0) - (a.simulation?.quality_score || 0))
        .slice(0, 10)
        .map(r => ({
            pairId: r.pairId,
            timestamp: r.timestamp,
            profit: r.simulation?.expected_profit,
            quality: r.simulation?.quality_score,
            tags: r.simulation?.quality_tags || []
        }));

    // Reason codes (Global)
    const reasons: Record<string, number> = {};
    results.forEach(r => {
        if (r.result === 'ERROR') {
             const code = r.reason || 'unknown_error';
             reasons[code] = (reasons[code] || 0) + 1;
        } else if (r.result !== 'OPPORTUNITY') {
             // Prefer top-level reason_code from scanner, fallback to simulation reason
             const code = r.reason_code || r.simulation?.components?.reason || 'unknown';
             reasons[code] = (reasons[code] || 0) + 1;
        } else if (r.simulation && !r.simulation.tradeable) {
             // Opportunity exists but not tradeable (e.g. low profit)
             const code = r.simulation?.components?.reason || 'untradeable_sim';
             reasons[code] = (reasons[code] || 0) + 1;
        }
    });

    const report = {
        config: { loops, intervalMs, eventTicker, minQuality },
        meta: {
            total_api_calls: loops,
            total_records: results.length,
            timestamp: new Date().toISOString()
        },
        stats: {
            hit_rate: hitRate,
            quality_hit_rate: qualityHitRate,
            tradeable_count: tradeable.length,
            quality_count: qualityHits.length,
            net_positive_count: tradeable.filter(r => (r.simulation?.expected_profit || 0) > 0).length,
            profit_stats: {
                p50, p90, avg: avgProfit, min: minProfitVal, max: maxProfitVal
            },
            quality_stats: {
                p50: qP50, p90: qP90, avg: qAvg, min: qMin, max: qMax
            }
        },
        top_by_profit: topByProfit,
        top_by_quality: topByQuality,
        reasons_top: Object.entries(reasons)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {})
    };

    // 4. Write Output
    const outDir = path.resolve(process.cwd(), 'out');
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    // JSON
    fs.writeFileSync(
        path.join(outDir, 'sample_report.json'), 
        JSON.stringify(report, null, 2)
    );

    // CSV
    const csvHeader = 'timestamp,pairId,result,tradeable,net_edge,expected_profit,quality_score,quality_tags,reason\n';
    const csvRows = results.map(r => {
        return [
            r.timestamp,
            r.pairId,
            r.result,
            r.simulation?.tradeable || false,
            r.simulation?.net_edge || 0,
            r.simulation?.expected_profit || 0,
            r.simulation?.quality_score || 0,
            (r.simulation?.quality_tags || []).join('|'),
            r.simulation?.components?.reason || r.reason_code || ''
        ].join(',');
    });
    
    fs.writeFileSync(
        path.join(outDir, 'sample_report.csv'), 
        csvHeader + csvRows.join('\n')
    );

    console.log(`[Success] Reports generated in ${outDir}`);
    console.log(`- sample_report.json`);
    console.log(`- sample_report.csv`);
}

main().catch(console.error);
