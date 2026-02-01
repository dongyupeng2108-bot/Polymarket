
import { pmRequest } from './src/lib/adapters/polymarket';

async function testPmFetch() {
    const GAMMA_URL = 'https://gamma-api.polymarket.com';
    console.log("Testing PM Fetch (Gamma) with limit=100...");
    const res1 = await pmRequest('/events', { params: { limit: 100, active: true, closed: false } }, GAMMA_URL);
    console.log("Limit 100 Success:", res1.success);
    if (res1.meta) console.log("URL Used:", res1.meta.url_used);
    if (!res1.success) console.log("Limit 100 Error:", res1.meta?.http_status, res1.meta?.error_message);

    console.log("\nTesting PM Fetch (Gamma) with limit=1000...");
    const res2 = await pmRequest('/events', { params: { limit: 1000, active: true, closed: false } }, GAMMA_URL);
    console.log("Limit 1000 Success:", res2.success);
    if (res2.success) console.log("Limit 1000 Count:", Array.isArray(res2.data) ? res2.data.length : 'Not Array');
    if (res2.meta) console.log("URL Used:", res2.meta.url_used);
    if (!res2.success) console.log("Limit 1000 Error:", res2.meta?.http_status, res2.meta?.error_message);
}

testPmFetch();
