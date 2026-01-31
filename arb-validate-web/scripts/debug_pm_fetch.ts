
import axios from 'axios';
import { ProxySelector } from '../src/lib/services/proxy-selector';
import { getAgent } from '../src/lib/utils/proxy-agent';

const PM_GAMMA_URL = 'https://gamma-api.polymarket.com';
const KALSHI_API_URL = 'https://api.elections.kalshi.com/trade-api/v2';

async function fetchWithProxy(url: string, params: any = {}): Promise<any> {
    const selector = ProxySelector.getInstance();
    const best = selector.selectBestProfile(new Set());
    const profile = best.profile;
    
    const agent = getAgent(profile, url);
    const instance = axios.create({
        ...agent,
        timeout: 15000,
        validateStatus: () => true
    });

    console.log(`Fetching ${url} with params:`, params);
    try {
        const res = await instance.get(url, { params });
        console.log(`Status: ${res.status}`);
        if (res.status !== 200) {
            console.log('Error Body:', JSON.stringify(res.data).substring(0, 500));
        } else {
            const len = Array.isArray(res.data) ? res.data.length : (res.data.markets ? res.data.markets.length : 'Unknown');
            console.log(`Success! Data length: ${len}`);
        }
    } catch (e: any) {
        console.error(`Error:`, e.message);
    }
}

(async () => {
    // PM Test: Try different sort
    console.log('--- PM Test: sort=volume ---');
    await fetchWithProxy(`${PM_GAMMA_URL}/events`, {
        tag_id: '789',
        limit: 5,
        sort: 'volume' // Try without order
    });

    console.log('\n--- PM Test: order=volume ---'); // Sometimes API uses order for field
    await fetchWithProxy(`${PM_GAMMA_URL}/events`, {
        tag_id: '789',
        limit: 5,
        order: 'volume'
    });

    // Kalshi Test
    console.log('\n--- Kalshi Test: Markets ---');
    await fetchWithProxy(`${KALSHI_API_URL}/markets`, {
        limit: 10,
        status: 'open'
    });
})();
