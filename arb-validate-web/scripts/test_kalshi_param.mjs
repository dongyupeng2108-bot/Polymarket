import axios from 'axios';

const BASE_URL = 'https://api.elections.kalshi.com/trade-api/v2/markets';

async function testParam(filter) {
    console.log(`Testing mve_filter=${filter}...`);
    try {
        const params = { limit: 10, status: 'open' };
        if (filter) params.mve_filter = filter;
        
        const res = await axios.get(BASE_URL, { params });
        console.log(`Status: ${res.status}`);
        console.log(`Markets found: ${res.data.markets ? res.data.markets.length : 0}`);
        if (res.data.markets && res.data.markets.length > 0) {
            console.log(`Sample Ticker: ${res.data.markets[0].ticker}`);
        }
    } catch (e) {
        console.error(`Error: ${e.message}`);
        if (e.response) {
            console.error(`Response: ${e.response.status} ${e.response.statusText}`);
            console.error(`Data:`, e.response.data);
        }
    }
}

async function run() {
    await testParam(undefined); // Baseline
    await testParam('exclude');
    await testParam('only');
}

run();