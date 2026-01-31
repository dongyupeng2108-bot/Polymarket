
import { khRequest } from '../src/lib/adapters/kalshi';

async function run() {
    console.log("Testing Kalshi Search with 'query' param...");
    const res = await khRequest('/markets', { params: { limit: 10, status: 'open', query: 'election' } });
    if (res.success) {
        console.log(`Count: ${res.data.markets.length}`);
        res.data.markets.forEach((m: any) => {
            console.log(`- ${m.ticker}: ${m.title}`);
        });
    } else {
        console.error("Failed", res);
    }

    console.log("\nTesting Kalshi Search WITHOUT 'query' param...");
    const res2 = await khRequest('/markets', { params: { limit: 10, status: 'open' } });
    if (res2.success) {
        console.log(`Count: ${res2.data.markets.length}`);
        res2.data.markets.forEach((m: any) => {
            console.log(`- ${m.ticker}: ${m.title}`);
        });
    }
}

run();
