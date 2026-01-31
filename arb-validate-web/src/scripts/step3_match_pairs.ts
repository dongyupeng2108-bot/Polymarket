
import fs from 'fs';
import path from 'path';

// Load env manually
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            const key = match[1].trim();
            const value = match[2].trim().replace(/^["']|[\"']$/g, '');
            process.env[key] = value;
        }
    });
}

const OUT_DIR = path.join(process.cwd(), 'out');

// Normalization Helper
function normalize(str: string) {
    return str.toLowerCase()
        .replace(/[^\w\s]/g, '') // remove punctuation
        .replace(/\s+/g, ' ')
        .trim();
}

async function main() {
    const dbModule = await import('../lib/db');
    const prisma = dbModule.prisma;
    
    // Load Data
    const kPath = path.join(OUT_DIR, 'kalshi_markets.json');
    const pPath = path.join(OUT_DIR, 'pm_markets.json');
    
    if (!fs.existsSync(kPath) || !fs.existsSync(pPath)) {
        console.error('Missing market data files. Run fetch steps first.');
        return;
    }
    
    const kMarkets = JSON.parse(fs.readFileSync(kPath, 'utf-8'));
    const pMarkets = JSON.parse(fs.readFileSync(pPath, 'utf-8'));
    
    console.log(`Loaded ${kMarkets.length} Kalshi, ${pMarkets.length} Polymarket markets.`);

    // --- C3: Matching ---
    console.log('Starting Matching...');
    const candidates: any[] = [];
    let updatedCount = 0;
    const newPairIds: number[] = [];

    // Pre-process PM for faster lookup (inverted index by keywords)
    const pmIndex: Record<string, number[]> = {};
    pMarkets.forEach((m: any, idx: number) => {
        const norm = normalize(m.question);
        const words = norm.split(' ').filter(w => w.length > 3);
        words.forEach(w => {
            if (!pmIndex[w]) pmIndex[w] = [];
            pmIndex[w].push(idx);
        });
    });

    const overridesPath = path.join(OUT_DIR, 'manual_overrides.json');
    const overrides = fs.existsSync(overridesPath) ? JSON.parse(fs.readFileSync(overridesPath, 'utf-8')) : {};

    // Helper to insert pair
    const insertPair = async (k: any, pm: any) => {
        // ... (Same logic as before)
        try {
            const existing = await prisma.pair.findFirst({
                where: { kh_ticker: k.ticker }
            });

            if (existing) {
                // Update logic if needed, or skip
                return existing.id;
            } else {
                const newPair = await prisma.pair.create({
                    data: {
                        kh_ticker: k.ticker,
                        title_kh: k.title,
                        title_pm: pm.question,
                        pm_market_slug: pm.slug,
                        pm_yes_token_id: 'pending',
                        pm_no_token_id: 'pending',
                        status: 'verified',
                        is_binary: true,
                        resolve_time_pm: new Date(), // Placeholder
                        resolve_time_kh: new Date(), // Placeholder
                        rules_pm: '',
                        rules_kh: ''
                    }
                });
                newPairIds.push(newPair.id);
                return newPair.id;
            }
        } catch (e) {
            console.error('DB Insert Error:', e);
            return null;
        }
    };

    for (const k of kMarkets) {
        // Post-fetch Filter: Skip Esports/Complex here
        if (k.ticker.startsWith('KXMV') || k.ticker.startsWith('KXNBA') || k.custom_strike) continue;

        const kNorm = normalize(k.title);
        const kWords = kNorm.split(' ').filter(w => w.length > 3);
        
        // Find potential PM matches
        const potentialPmIndices = new Map<number, number>(); // idx -> hits
        kWords.forEach(w => {
            if (pmIndex[w]) {
                pmIndex[w].forEach(idx => {
                    potentialPmIndices.set(idx, (potentialPmIndices.get(idx) || 0) + 1);
                });
            }
        });

        // Score candidates
        let bestMatch: { pm: any, score: number } | null = null;
        
        for (const [pIdx, hits] of potentialPmIndices.entries()) {
            const p = pMarkets[pIdx];
            const pNorm = normalize(p.question);
            const pWords = pNorm.split(' ').filter(w => w.length > 3);
            
            const union = new Set([...kWords, ...pWords]);
            const jaccard = hits / union.size;

            // Prioritize matches with specific keywords
            const highValueKeywords = ['fed', 'interest', 'rate', 'cpi', 'inflation', 'gdp', 'senate', 'house', 'president', 'bitcoin', 'ethereum'];
            let bonus = 0;
            for (const kw of highValueKeywords) {
                if (kNorm.includes(kw) && pNorm.includes(kw)) {
                    bonus += 0.1;
                }
            }

            const totalScore = jaccard + bonus;

            if (!bestMatch || totalScore > bestMatch.score) {
                bestMatch = { pm: p, score: totalScore };
            }
        }

        if (bestMatch && bestMatch.score >= 0.6) {
             candidates.push({
                 k_ticker: k.ticker,
                 k_title: k.title,
                 pm_question: bestMatch.pm.question,
                 score: bestMatch.score,
                 pm_slug: bestMatch.pm.slug,
                 pm_id: bestMatch.pm.id, 
             });
             
             if (bestMatch.score >= 0.75) {
                 await insertPair(k, bestMatch.pm);
                 updatedCount++;
             }
        }
    }

    // Report
    const report = {
        total_kalshi: kMarkets.length,
        total_pm: pMarkets.length,
        candidates_found: candidates.length,
        inserted_or_updated: updatedCount,
        new_pair_ids: newPairIds.slice(0, 10)
    };

    fs.writeFileSync(path.join(OUT_DIR, 'pair_candidates.json'), JSON.stringify(candidates, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'pair_seed_report.json'), JSON.stringify(report, null, 2));
    
    console.log('Matching Complete.');
    console.log('Report:', JSON.stringify(report, null, 2));
}

main().catch(console.error);
