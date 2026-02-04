
import https from 'https';

export interface BetfairBook {
    marketId: string;
    lastMatchTime?: string;
    totalMatched?: number;
    runners: {
        selectionId: number;
        status: string;
        ex: {
            availableToBack: { price: number; size: number }[];
            availableToLay: { price: number; size: number }[];
        };
    }[];
}

export interface BetfairSimplePrice {
    bestBack: number | null; // Price you can BUY at (Back) -> matches 'availableToBack'
    bestLay: number | null;  // Price you can SELL at (Lay) -> matches 'availableToLay'
    lastUpdate: number;
}

const APP_KEY = process.env.BETFAIR_APP_KEY;
const SESSION_TOKEN = process.env.BETFAIR_SESSION_TOKEN;

// Minimal fetch wrapper
async function bfFetch(endpoint: string, body: any): Promise<any> {
    if (!APP_KEY || !SESSION_TOKEN) {
        throw new Error('missing_credentials');
    }

    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.betfair.com',
            port: 443,
            path: `/exchange/betting/rest/v1.0/${endpoint}`,
            method: 'POST',
            headers: {
                'X-Application': APP_KEY,
                'X-Authentication': SESSION_TOKEN,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`http_${res.statusCode}_${data}`));
                } else {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error('invalid_json'));
                    }
                }
            });
        });

        req.on('error', (e) => reject(e));
        req.write(JSON.stringify(body));
        req.end();
    });
}

export async function getMarketBook(marketId: string): Promise<BetfairSimplePrice | null> {
    try {
        const resp = await bfFetch('listMarketBook', {
            marketIds: [marketId],
            priceProjection: {
                priceData: ['EX_BEST_OFFERS'],
                exBestOffersOverrides: { bestPricesDepth: 1 }
            }
        });

        if (!resp || !Array.isArray(resp) || resp.length === 0) return null;

        const market = resp[0];
        // Assuming we want the first runner (usually the main one or YES/NO needs mapping)
        // For simplicity in this M4, we take the first runner's prices
        // Real logic needs selectionId mapping.
        if (!market.runners || market.runners.length === 0) return null;

        const runner = market.runners[0]; // TODO: Select correct runner based on Pair config
        
        const bestBack = runner.ex.availableToBack?.[0]?.price || null;
        const bestLay = runner.ex.availableToLay?.[0]?.price || null;

        return {
            bestBack,
            bestLay,
            lastUpdate: Date.now()
        };

    } catch (error) {
        console.error('Betfair fetch error:', error);
        return null;
    }
}

export async function checkHealth() {
    const start = Date.now();
    try {
        // Use listEventTypes as a lightweight ping
        await bfFetch('listEventTypes', { filter: {} });
        return {
            status: 'ok',
            latency: Date.now() - start,
            http_status: 200
        };
    } catch (e: any) {
        return {
            status: 'error',
            latency: Date.now() - start,
            error_reason: e.message || 'unknown'
        };
    }
}
