
import { khRequest } from '../src/lib/adapters/kalshi';

async function main() {
    console.log("Fetching one event to get a ticker...");
    const eventRes = await khRequest('/events', { params: { limit: 1 } });
    
    if (!eventRes.success || !eventRes.data.events || eventRes.data.events.length === 0) {
        console.error("Failed to fetch events:", eventRes);
        return;
    }

    const event = eventRes.data.events[0];
    const ticker = event.event_ticker; // Note: API might use 'ticker' or 'event_ticker'
    console.log(`Found event: ${ticker} (${event.title})`);

    console.log(`Fetching markets for event_ticker=${ticker}...`);
    const marketRes = await khRequest('/markets', { params: { limit: 100, event_ticker: ticker } });

    if (marketRes.success) {
        console.log(`Success! Found ${marketRes.data.markets?.length || 0} markets.`);
        if (marketRes.data.markets?.length > 0) {
            console.log("Sample market:", marketRes.data.markets[0].ticker);
        } else {
            console.log("Response data:", JSON.stringify(marketRes.data, null, 2));
        }
    } else {
        console.error("Failed to fetch markets:", marketRes);
    }
}

main().catch(console.error);
