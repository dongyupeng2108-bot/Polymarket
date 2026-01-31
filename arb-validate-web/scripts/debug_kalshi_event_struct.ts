
import axios from 'axios';
import { ProxySelector } from '../src/lib/services/proxy-selector';
import { getAgent } from '../src/lib/utils/proxy-agent';

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

    try {
        const res = await instance.get(url, { params });
        return res.data;
    } catch (e: any) {
        console.error(`Error:`, e.message);
        return null;
    }
}

(async () => {
    console.log('Fetching Kalshi Events for Economics...');
    const data = await fetchWithProxy(`${KALSHI_API_URL}/events`, {
        limit: 5,
        category: 'Economics',
        status: 'open'
    });

    if (data?.events && data.events.length > 0) {
        const evt = data.events[0];
        console.log('Event Keys:', Object.keys(evt).join(', '));
        console.log('Event Ticker:', evt.event_ticker);
        console.log('Event Title:', evt.title);
        // Check if markets are included
        if (evt.markets) {
            console.log('Markets included in Event!');
            console.log('Market count:', evt.markets.length);
        } else {
            console.log('No "markets" field in Event.');
        }
        
        // Fetch markets for this event
        console.log('\nFetching markets for event:', evt.event_ticker);
        const mData = await fetchWithProxy(`${KALSHI_API_URL}/markets`, {
            event_ticker: evt.event_ticker
        });
        if (mData?.markets) {
             console.log('Markets found:', mData.markets.length);
             console.log('Market Sample:', JSON.stringify(mData.markets[0]).substring(0, 200));
        }
    } else {
        console.log('No events found.');
    }
})();
