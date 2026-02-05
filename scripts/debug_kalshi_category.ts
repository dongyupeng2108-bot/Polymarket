
import { khRequest } from '../src/lib/adapters/kalshi.js';

// Mock the environment
process.env.KALSHI_API_URL = 'https://api.elections.kalshi.com/trade-api/v2';
// Ensure we don't need credentials for public endpoints
delete process.env.KALSHI_KEY_ID;
delete process.env.KALSHI_PRIVATE_KEY;

async function testKalshiEndpoint(endpoint: string, params: any) {
  console.log(`\nTesting ${endpoint} with params: ${JSON.stringify(params)}`);
  
  try {
    const res = await khRequest(endpoint, { params });
    
    if (!res.success) {
        console.error(`Request Failed: ${res.meta?.error_message || 'Unknown error'}`);
        console.error(`Meta:`, res.meta);
        return null;
    }

    const data = res.data;
    console.log(`Status: 200 (Success)`);
    console.log(`Response Keys: ${Object.keys(data).join(', ')}`);
    
    if (data.markets) {
        console.log(`Markets count: ${data.markets.length}`);
        if (data.markets.length > 0) {
            console.log(`Market Sample Keys: ${Object.keys(data.markets[0]).sort().join(', ')}`);
            // Check if 'category' exists
            console.log(`First Market Category Field: ${data.markets[0].category}`);
            console.log(`First Market Ticker: ${data.markets[0].ticker}`);
        }
    } else if (data.series) {
        console.log(`Series count: ${data.series.length}`);
        if (data.series.length > 0) {
            console.log(`Series Sample Keys: ${Object.keys(data.series[0]).sort().join(', ')}`);
            console.log(`First Series Category: ${data.series[0].category}`);
        }
    }
    
    return data;
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
    return null;
  }
}

async function main() {
    // Test 1: /markets with category parameter directly
    console.log("--- Test 1: Direct /markets fetch by category (Economics) ---");
    const eco = await testKalshiEndpoint('/markets', { 
        limit: 5, 
        status: 'open', 
        category: 'Economics' 
    });
    if (eco?.markets) {
        eco.markets.forEach((m: any) => console.log(`[Economics] ${m.ticker}: ${m.title}`));
    }

    // Test 4: /events with category
    console.log("\n--- Test 4: /events with category (Economics) ---");
    const events = await testKalshiEndpoint('/events', { 
        limit: 5, 
        status: 'open', 
        category: 'Economics' // or 'economics' lowercase?
    });
    if (events?.events) {
        console.log(`Events count: ${events.events.length}`);
        if (events.events.length > 0) {
            console.log(`Event Sample Keys: ${Object.keys(events.events[0]).sort().join(', ')}`);
            // Check if markets are embedded
            console.log(`First Event Markets:`, events.events[0].markets); 
            console.log(`First Event Ticker: ${events.events[0].event_ticker}`);
            console.log(`First Event Series Ticker: ${events.events[0].series_ticker}`);
        }
    }
}

main();
