
import { ProxySelector } from '../src/lib/services/proxy-selector';
import { getAgent } from '../src/lib/utils/proxy-agent';
import axios from 'axios';

const KALSHI_API_URL = 'https://api.elections.kalshi.com/trade-api/v2';

async function fetchWithProxy(url: string, params: any = {}): Promise<any> {
    const selector = ProxySelector.getInstance();
    const best = selector.selectBestProfile(new Set());
    const profile = best.profile;
    const agent = getAgent(profile, url);
    const instance = axios.create({ ...agent, timeout: 15000, validateStatus: () => true });
    try {
        const res = await instance.get(url, { params });
        return res.data;
    } catch (e) { return null; }
}

(async () => {
    console.log("Fetching /events?limit=5...");
    const data = await fetchWithProxy(`${KALSHI_API_URL}/events`, { limit: 5, status: 'open' });
    if (data?.events) {
        const evt = data.events[0];
        console.log("Event Structure Keys:", Object.keys(evt));
        console.log("Event Sample:", JSON.stringify(evt, null, 2));
    } else {
        console.log("No events found or fetch failed.");
    }
})();
