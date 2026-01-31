
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
    const pmModule = await import('../lib/adapters/polymarket');
    const pmRequest = pmModule.pmRequest;
    const GAMMA_URL = 'https://gamma-api.polymarket.com';

    console.log('Starting Polymarket Fetch...');
    let allMarkets: any[] = [];
    let offset = 0;
    const LIMIT = 100;
    const MAX_MARKETS = 3000; 

    while (allMarkets.length < MAX_MARKETS) {
        console.log(`Fetching Polymarket... current count: ${allMarkets.length}, offset: ${offset}`);
        try {
            const params = { 
                limit: LIMIT, 
                offset: offset, 
                enableOrderBook: 'true',
                active: 'true',
                closed: 'false'
            };

            const res = await pmRequest('/markets', { params }, GAMMA_URL);
            if (!res.success) {
                console.error('PM fetch failed:', res.meta);
                break;
            }

            const markets = res.data;
            if (!Array.isArray(markets) || markets.length === 0) break;

            allMarkets.push(...markets);
            offset += LIMIT;
            
            await sleep(100);
        } catch (e) {
            console.error('PM loop error:', e);
            break;
        }
    }

    fs.writeFileSync(path.join(OUT_DIR, 'pm_markets.json'), JSON.stringify(allMarkets, null, 2));
    console.log(`Saved ${allMarkets.length} Polymarket markets.`);
}

main().catch(console.error);
