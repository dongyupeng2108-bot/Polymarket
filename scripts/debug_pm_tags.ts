
import axios from 'axios';
import { ProxySelector } from '../src/lib/services/proxy-selector';
import { getAgent } from '../src/lib/utils/proxy-agent';

const PM_GAMMA_URL = 'https://gamma-api.polymarket.com';

async function run() {
    const selector = ProxySelector.getInstance();
    const best = selector.selectBestProfile(new Set());
    const profile = best.profile;
    const agent = getAgent(profile, PM_GAMMA_URL);
    const instance = axios.create({ ...agent, timeout: 15000, validateStatus: () => true });

    console.log('Fetching tags...');
    const res = await instance.get(`${PM_GAMMA_URL}/tags?limit=1000`);
    console.log('Status:', res.status);
    
    if (Array.isArray(res.data)) {
        // Test 1: Query by slug
        console.log('\n--- Test 1: Query by slug=politics ---');
        const res2 = await instance.get(`${PM_GAMMA_URL}/tags?slug=politics`);
        console.log('Status:', res2.status);
        console.log('Data:', JSON.stringify(res2.data, null, 2));
    }
}

run().catch(console.error);
