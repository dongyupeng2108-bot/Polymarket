
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
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    const khModule = await import('../lib/adapters/kalshi');
    const khRequest = khModule.khRequest;

    console.log('Starting Kalshi Fetch...');
    let allMarkets: any[] = [];
    let cursor: string | undefined = undefined;
    const LIMIT = 100;
    const MAX_MARKETS = 5000; 

    while (allMarkets.length < MAX_MARKETS) {
        console.log(`Fetching Kalshi... current count: ${allMarkets.length}, cursor: ${cursor || 'start'}`);
        try {
            const params: any = { limit: LIMIT, status: 'open' };
            if (cursor) params.cursor = cursor;

            const res = await khRequest('/markets', { params });
            if (!res.success) {
                console.error('Kalshi fetch failed:', res.meta);
                break;
            }

            const markets = res.data.markets || [];
            if (markets.length === 0) break;

            // Filter minimal to allow speed (post-filter in match step)
            // Only filter absolutely broken ones if any
            const cleanMarkets = markets; 
            
            allMarkets.push(...cleanMarkets);
            cursor = res.data.cursor;

            if (!cursor) break;
            await sleep(100); 
        } catch (e) {
            console.error('Kalshi loop error:', e);
            break;
        }
    }

    fs.writeFileSync(path.join(OUT_DIR, 'kalshi_markets.json'), JSON.stringify(allMarkets, null, 2));
    console.log(`Saved ${allMarkets.length} Kalshi markets (filtered).`);
}

main().catch(console.error);
