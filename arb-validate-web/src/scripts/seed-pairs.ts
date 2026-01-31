
import { PrismaClient } from '@prisma/client';
import { spawn } from 'child_process';

const prisma = new PrismaClient();

function fetchWithPowershell(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
        // Use PowerShell with User-Agent
        const psCommand = `
        $headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
        try {
            $response = Invoke-WebRequest -Uri '${url}' -UseBasicParsing -Headers $headers -TimeoutSec 20
            $response.Content
        } catch {
            Write-Error $_.Exception.Message
            exit 1
        }
        `;
        
        const args = ['-NoProfile', '-Command', psCommand];
        // console.log(`Fetching: ${url.substring(0, 80)}...`);
        
        const child = spawn('powershell', args);

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            if (code !== 0) {
                // console.log(`PS exited code ${code}`);
                // if (stderr) console.log('Stderr:', stderr.trim());
                resolve(null);
            } else {
                try {
                    if (!stdout || !stdout.trim()) {
                        // console.log('Empty stdout');
                        resolve(null);
                    }
                    else resolve(JSON.parse(stdout));
                } catch (e: any) {
                    console.log('JSON Parse Error:', e.message);
                    resolve(null);
                }
            }
        });

        child.on('error', (err) => {
            console.log('Spawn Error:', err.message);
            resolve(null);
        });
    });
}

const PAIRS_DATA = [
   { 
     "pair_id": "SP500ADDQ1_01_VRT", 
     "topic": "S&P500新增成分股(Q1 2026)", 
     "pm_url": "https://polymarket.com/event/which-companies-added-to-sp-500-in-q1-2026", 
     "pm_outcome_hint": "Vertiv Holdings (VRT)", 
     "kh_url": "https://kalshi.com/markets/kxsp500addq/quarterly-which-companies-will-be-added-to-sp500-/kxsp500addq-26mar31", 
     "kh_outcome_hint": "Vertiv Holdings" 
   }, 
   { 
     "pair_id": "SP500ADDQ1_02_SOFI", 
     "topic": "S&P500新增成分股(Q1 2026)", 
     "pm_url": "https://polymarket.com/event/which-companies-added-to-sp-500-in-q1-2026", 
     "pm_outcome_hint": "SoFi Technologies (SOFI)", 
     "kh_url": "https://kalshi.com/markets/kxsp500addq/quarterly-which-companies-will-be-added-to-sp500-/kxsp500addq-26mar31", 
     "kh_outcome_hint": "SoFi" 
   }, 
   { 
     "pair_id": "SP500ADDQ1_03_CIEN", 
     "topic": "S&P500新增成分股(Q1 2026)", 
     "pm_url": "https://polymarket.com/event/which-companies-added-to-sp-500-in-q1-2026", 
     "pm_outcome_hint": "Ciena (CIEN)", 
     "kh_url": "https://kalshi.com/markets/kxsp500addq/quarterly-which-companies-will-be-added-to-sp500-/kxsp500addq-26mar31", 
     "kh_outcome_hint": "Ciena" 
   }, 
   { 
     "pair_id": "SP500ADDQ1_04_ALNY", 
     "topic": "S&P500新增成分股(Q1 2026)", 
     "pm_url": "https://polymarket.com/event/which-companies-added-to-sp-500-in-q1-2026", 
     "pm_outcome_hint": "Alnylam Pharmaceuticals (ALNY)", 
     "kh_url": "https://kalshi.com/markets/kxsp500addq/quarterly-which-companies-will-be-added-to-sp500-/kxsp500addq-26mar31", 
     "kh_outcome_hint": "Alnylam" 
   }, 
   { 
     "pair_id": "SP500ADDQ1_05_AFRM", 
     "topic": "S&P500新增成分股(Q1 2026)", 
     "pm_url": "https://polymarket.com/event/which-companies-added-to-sp-500-in-q1-2026", 
     "pm_outcome_hint": "Affirm Holdings (AFRM)", 
     "kh_url": "https://kalshi.com/markets/kxsp500addq/quarterly-which-companies-will-be-added-to-sp500-/kxsp500addq-26mar31", 
     "kh_outcome_hint": "Affirm" 
   }, 
   { 
     "pair_id": "SP500ADDQ1_06_PSTG", 
     "topic": "S&P500新增成分股(Q1 2026)", 
     "pm_url": "https://polymarket.com/event/which-companies-added-to-sp-500-in-q1-2026", 
     "pm_outcome_hint": "Pure Storage (PSTG)", 
     "kh_url": "https://kalshi.com/markets/kxsp500addq/quarterly-which-companies-will-be-added-to-sp500-/kxsp500addq-26mar31", 
     "kh_outcome_hint": "Pure Storage" 
   }, 
   { 
     "pair_id": "SP500ADDQ1_07_MSTR", 
     "topic": "S&P500新增成分股(Q1 2026)", 
     "pm_url": "https://polymarket.com/event/which-companies-added-to-sp-500-in-q1-2026", 
     "pm_outcome_hint": "Strategy (MicroStrategy) (MSTR)", 
     "kh_url": "https://kalshi.com/markets/kxsp500addq/quarterly-which-companies-will-be-added-to-sp500-/kxsp500addq-26mar31", 
     "kh_outcome_hint": "Strategy" 
   }, 
   { 
     "pair_id": "SP500ADDQ1_08_FSLR", 
     "topic": "S&P500新增成分股(Q1 2026)", 
     "pm_url": "https://polymarket.com/event/which-companies-added-to-sp-500-in-q1-2026", 
     "pm_outcome_hint": "First Solar (FSLR)", 
     "kh_url": "https://kalshi.com/markets/kxsp500addq/quarterly-which-companies-will-be-added-to-sp500-/kxsp500addq-26mar31", 
     "kh_outcome_hint": "First Solar" 
   }, 
   { 
     "pair_id": "SP500ADDQ1_09_CCOI", 
     "topic": "S&P500新增成分股(Q1 2026)", 
     "pm_url": "https://polymarket.com/event/which-companies-added-to-sp-500-in-q1-2026", 
     "pm_outcome_hint": "Cogent Communications (CCOI)", 
     "kh_url": "https://kalshi.com/markets/kxsp500addq/quarterly-which-companies-will-be-added-to-sp500-/kxsp500addq-26mar31", 
     "kh_outcome_hint": "Cogent" 
   }, 
   { 
     "pair_id": "SP500ADDQ1_10_VEEV", 
     "topic": "S&P500新增成分股(Q1 2026)", 
     "pm_url": "https://polymarket.com/event/which-companies-added-to-sp-500-in-q1-2026", 
     "pm_outcome_hint": "Veeva Systems (VEEV)", 
     "kh_url": "https://kalshi.com/markets/kxsp500addq/quarterly-which-companies-will-be-added-to-sp500-/kxsp500addq-26mar31", 
     "kh_outcome_hint": "Veeva" 
   }, 
   { 
     "pair_id": "FOMC_JAN26_01_NOCHANGE", 
     "topic": "FOMC 2026-01 决议", 
     "pm_url": "https://polymarket.com/event/fed-decision-in-january", 
     "pm_outcome_hint": "No change", 
     "kh_url": "https://kalshi.com/markets/kxfeddecision/fed-meeting/kxfeddecision-26jan", 
     "kh_outcome_hint": "Hike of 0bps" 
   }, 
   { 
     "pair_id": "FOMC_JAN26_02_CUT25", 
     "topic": "FOMC 2026-01 决议", 
     "pm_url": "https://polymarket.com/event/fed-decision-in-january", 
     "pm_outcome_hint": "25 bps decrease", 
     "kh_url": "https://kalshi.com/markets/kxfeddecision/fed-meeting/kxfeddecision-26jan", 
     "kh_outcome_hint": "Cut of 25bps" 
   }, 
   { 
     "pair_id": "FOMC_JAN26_03_CUT50P", 
     "topic": "FOMC 2026-01 决议", 
     "pm_url": "https://polymarket.com/event/fed-decision-in-january", 
     "pm_outcome_hint": "50+ bps decrease", 
     "kh_url": "https://kalshi.com/markets/kxfeddecision/fed-meeting/kxfeddecision-26jan", 
     "kh_outcome_hint": "Cut of 50bps" 
   }, 
   { 
     "pair_id": "FOMC_JAN26_04_HIKE25P", 
     "topic": "FOMC 2026-01 决议", 
     "pm_url": "https://polymarket.com/event/fed-decision-in-january", 
     "pm_outcome_hint": "25+ bps increase", 
     "kh_url": "https://kalshi.com/markets/kxfeddecision/fed-meeting/kxfeddecision-26jan", 
     "kh_outcome_hint": "Hike of 25bps" 
   }, 
   { 
     "pair_id": "U3MAX26_01_GE5", 
     "topic": "2026美国失业率上限", 
     "pm_url": "https://polymarket.com/event/how-high-will-us-unemployment-go-in-2026", 
     "pm_outcome_hint": "5.0%", 
     "kh_url": "https://kalshi.com/markets/kxunemploymentmax/unemployment-max/kxunemploymentmax-26", 
     "kh_outcome_hint": "5.0%" 
   }, 
   { 
     "pair_id": "U3MAX26_02_GE55", 
     "topic": "2026美国失业率上限", 
     "pm_url": "https://polymarket.com/event/how-high-will-us-unemployment-go-in-2026", 
     "pm_outcome_hint": "5.5%", 
     "kh_url": "https://kalshi.com/markets/kxunemploymentmax/unemployment-max/kxunemploymentmax-26", 
     "kh_outcome_hint": "5.5%" 
   }, 
   { 
     "pair_id": "U3MAX26_03_GE6", 
     "topic": "2026美国失业率上限", 
     "pm_url": "https://polymarket.com/event/how-high-will-us-unemployment-go-in-2026", 
     "pm_outcome_hint": "6.0%", 
     "kh_url": "https://kalshi.com/markets/kxunemploymentmax/unemployment-max/kxunemploymentmax-26", 
     "kh_outcome_hint": "6.0%" 
   }, 
   { 
     "pair_id": "U3MAX26_04_GE7", 
     "topic": "2026美国失业率上限", 
     "pm_url": "https://polymarket.com/event/how-high-will-us-unemployment-go-in-2026", 
     "pm_outcome_hint": "7.0%", 
     "kh_url": "https://kalshi.com/markets/kxunemploymentmax/unemployment-max/kxunemploymentmax-26", 
     "kh_outcome_hint": "7.0%" 
   }, 
   { 
     "pair_id": "U3MAX26_05_GE10", 
     "topic": "2026美国失业率上限", 
     "pm_url": "https://polymarket.com/event/how-high-will-us-unemployment-go-in-2026", 
     "pm_outcome_hint": "10.0%", 
     "kh_url": "https://kalshi.com/markets/kxunemploymentmax/unemployment-max/kxunemploymentmax-26", 
     "kh_outcome_hint": "10.0%" 
   }, 
   { 
     "pair_id": "INFLMAX26_01_GE3", 
     "topic": "2026通胀上限(是否>=3%)", 
     "pm_url": "https://polymarket.com/event/how-high-will-inflation-get-in-2026", 
     "pm_outcome_hint": "Above 3%", 
     "kh_url": "https://kalshi.com/markets/kxlcpimaxyoy/inflation-surge-this-year/kxlcpimaxyoy-27", 
     "kh_outcome_hint": "at least 3% in any month in 2026" 
   } 
];

async function resolvePolymarket(slug: string, hint: string) {
    const data = await fetchWithPowershell(`https://gamma-api.polymarket.com/events?slug=${slug}`);
    if (!data || data.length === 0) return null;
    
    const event = data[0];
    const market = event.markets.find((m: any) => 
        (m.groupItemTitle && m.groupItemTitle === hint) || 
        (m.question && m.question.includes(hint)) ||
        (m.groupItemTitle && m.groupItemTitle.includes(hint))
    );
    
    if (market) {
        return {
            id: market.id,
            tokenId: market.clobTokenIds ? JSON.parse(market.clobTokenIds)[0] : null,
            title: market.groupItemTitle || market.question,
            endDate: market.endDate
        };
    }
    return null;
}

async function resolveKalshi(khUrl: string, hint: string) {
    // Strategy 1: Try to fetch market directly by ticker (last part of URL)
    const urlObj = new URL(khUrl);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    const ticker = pathParts[pathParts.length - 1]; 
    
    const baseUrl = 'https://api.elections.kalshi.com/trade-api/v2';
    
    // Uppercase ticker just in case
    const upTicker = ticker.toUpperCase();
    // console.log(`Trying direct Kalshi ticker: ${upTicker}`);
    const directData = await fetchWithPowershell(`${baseUrl}/markets/${upTicker}`);
    
    if (directData && directData.market) {
        return {
            ticker: directData.market.ticker,
            title: directData.market.title + ' ' + directData.market.subtitle,
            expirationTime: directData.market.expiration_time
        };
    }

    // Strategy 2: Search by series ticker
    const seriesTicker = pathParts[1].toUpperCase();
    // console.log(`Trying Kalshi series: ${seriesTicker}`);
    
    const data = await fetchWithPowershell(`${baseUrl}/markets?series_ticker=${seriesTicker}`);
    if (!data || !data.markets) return null;
    
    const market = data.markets.find((m: any) => 
        m.subtitle === hint || 
        m.title.includes(hint) ||
        (m.subtitle && m.subtitle.includes(hint))
    );
    
    if (market) {
        return {
            ticker: market.ticker,
            title: market.title + ' ' + market.subtitle,
            expirationTime: market.expiration_time
        };
    }
    return null;
}

async function seed() {
    console.log('Starting seed process...');
    
    for (const p of PAIRS_DATA) {
        console.log(`Processing ${p.pair_id}...`);
        
        const pmSlug = p.pm_url.split('/').pop();
        const pmData = await resolvePolymarket(pmSlug!, p.pm_outcome_hint);
        
        const khData = await resolveKalshi(p.kh_url, p.kh_outcome_hint);
        
        if (pmData && pmData.tokenId && khData && khData.ticker) {
            console.log(`  -> Resolved: PM=${pmData.tokenId} KH=${khData.ticker}`);
            
            // Check if exists
            const existing = await prisma.pair.findFirst({
                where: { pm_market_id: pmData.tokenId }
            });

            if (existing) {
                console.log('  -> Pair already exists, skipping create.');
            } else {
                await prisma.pair.create({
                    data: {
                        pm_yes_token_id: pmData.tokenId,
                        kh_ticker: khData.ticker,
                        title_pm: `${p.topic} - ${p.pm_outcome_hint} (PM)`,
                        title_kh: `${p.topic} - ${p.kh_outcome_hint} (KH)`,
                        resolve_time_pm: new Date(pmData.endDate || new Date()),
                        resolve_time_kh: new Date(), // Kalshi API might need date parsing
                        rules_pm: JSON.stringify(pmData),
                        rules_kh: JSON.stringify(khData),
                        status: 'ready',
                        confidence: 1.0,
                        tags: ['auto-seeded']
                    }
                });
                console.log('  -> Saved to DB');
            }
        } else {
            console.log(`  -> Failed to resolve: PM=${!!pmData} KH=${!!khData}`);
        }
        
        // console.log('Finished processing ' + p.pair_id);
    }
}

seed()
  .catch(e => console.log('Seed Error:', e))
  .finally(async () => {
    await prisma.$disconnect();
  });
