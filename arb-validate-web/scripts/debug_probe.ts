
import axios from 'axios';
import { ProxySelector } from '../src/lib/services/proxy-selector';
import { getAgent } from '../src/lib/utils/proxy-agent';

const PM_GAMMA_URL = 'https://gamma-api.polymarket.com';
const KALSHI_API_URL = 'https://api.elections.kalshi.com/trade-api/v2';

async function fetchWithProxy(url: string, params: any = {}): Promise<any> {
    const selector = ProxySelector.getInstance();
    const best = selector.selectBestProfile(new Set());
    const profile = best.profile;
    console.log(`Using Proxy: ${profile.name} (${profile.type})`);
    
    const agent = getAgent(profile, url);
    const instance = axios.create({
        ...agent,
        timeout: 10000,
        validateStatus: () => true
    });

    try {
        const res = await instance.get(url, { params });
        console.log(`[${url}] Status: ${res.status}`);
        if (res.status !== 200) {
            console.log('Error Body:', JSON.stringify(res.data).slice(0, 500));
        }
        return res.data;
    } catch (e: any) {
        console.error(`Fetch Error: ${e.message}`);
        throw e;
    }
}

async function debugPM() {
    console.log('--- Debug PM ---');
    
    // Check Earnings Tag
    console.log(`\nTest Earnings: Fetch by tag_slug=earnings (no sort)`);
    let res = await fetchWithProxy(`${PM_GAMMA_URL}/markets`, { tag_slug: 'earnings', limit: 10, closed: false });
    if (Array.isArray(res)) {
        console.log(`Earnings Items: ${res.length}`);
        res.slice(0, 3).forEach((m: any) => console.log(`- ${m.question} (Vol: ${m.volume || m.volumeNum})`));
    } else {
        console.log('Earnings fetch failed');
    }

    // Check Economy Tag
    console.log(`\nTest Economy: Fetch by tag_slug=economy (no sort)`);
    res = await fetchWithProxy(`${PM_GAMMA_URL}/markets`, { tag_slug: 'economy', limit: 10, closed: false });
    if (Array.isArray(res)) {
        console.log(`Economy Items: ${res.length}`);
        res.slice(0, 3).forEach((m: any) => console.log(`- ${m.question} (Vol: ${m.volume || m.volumeNum})`));
    }

    // Check Tech Tag (technology)
    console.log(`\nTest Tech: Fetch by tag_slug=technology (no sort)`);
    res = await fetchWithProxy(`${PM_GAMMA_URL}/markets`, { tag_slug: 'technology', limit: 10, closed: false });
    if (Array.isArray(res)) {
        console.log(`Tech Items: ${res.length}`);
        res.slice(0, 3).forEach((m: any) => console.log(`- ${m.question} (Vol: ${m.volume || m.volumeNum})`));
    }
}

async function debugKalshi() {
    console.log('--- Debug Kalshi ---');
    console.log('Fetching Kalshi Series (Limit 300)...');
    
    // Fetch a large batch to see available categories
    const data = await fetchWithProxy(`${KALSHI_API_URL}/series`, { limit: 300, include_volume: true });
    
    if (data.series && Array.isArray(data.series)) {
        const categories = new Set(data.series.map((s: any) => s.category));
        console.log('Observed Categories:', Array.from(categories).sort());
        
        // Check specific keywords in titles if category is missing
        const earnings = data.series.filter((s: any) => s.title.toLowerCase().includes('earnings'));
        console.log(`\nFound 'earnings' in titles: ${earnings.length}`);
        earnings.slice(0, 3).forEach((s: any) => console.log(`- [${s.category}] ${s.title}`));
    } else {
        console.log('Failed to fetch series or invalid format');
    }
}

async function run() {
    await debugPM();
    await debugKalshi();
}

run();
