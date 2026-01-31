
import { getMarketsByEvent, fetchKalshiBookDebug } from '../src/lib/adapters/kalshi';

async function main() {
    const eventTicker = 'KXFEDCHAIRNOM-29';
    console.log(`Fetching markets for event: ${eventTicker}...`);
    
    const marketsRes = await getMarketsByEvent(eventTicker);
    
    if (!marketsRes.success) {
        console.error('Failed to fetch markets:', marketsRes.meta);
        return;
    }

    const markets = marketsRes.data.markets || [];
    console.log(`Total markets found: ${markets.length}`);

    // Mapping: Nominee -> Ticker
    const nomineeToTicker: Record<string, string> = {};
    const tickerToNominee: Record<string, string> = {};

    markets.forEach((m: any) => {
        const ticker = m.ticker;
        // User mentioned custom_strike.Nominee. 
        // Also title might be useful if custom_strike is missing.
        const nominee = m.custom_strike?.Nominee || m.title || 'Unknown';
        
        if (ticker) {
            nomineeToTicker[nominee] = ticker;
            tickerToNominee[ticker] = nominee;
        }
    });

    // Output first 5 markets
    const sampleMarkets = markets.slice(0, 5);
    
    // Ensure target ticker is in the list for verification
    const targetTicker = 'KXFEDCHAIRNOM-29-KW';
    if (!sampleMarkets.find((m: any) => m.ticker === targetTicker)) {
        const targetMarket = markets.find((m: any) => m.ticker === targetTicker);
        if (targetMarket) {
            sampleMarkets.push(targetMarket);
        } else {
            console.warn(`Target ticker ${targetTicker} not found in markets list!`);
        }
    }

    console.log('\n--- Sample Markets (Orderbook Fetch) ---');
    
    for (const m of sampleMarkets) {
        const ticker = m.ticker;
        const nominee = tickerToNominee[ticker];
        
        console.log(`\nFetching orderbook for [${ticker}] (${nominee})...`);
        
        // Use fetchKalshiBookDebug to get parsed orderbook
        const obRes = await fetchKalshiBookDebug(ticker);
        
        if (obRes.final.ok) {
            const bids = obRes.parsed_book.bids;
            const asks = obRes.parsed_book.asks;
            
            console.log(`  > Bids (YES?): ${bids.length} levels`);
            if (bids.length > 0) console.log(`    Top Bid: ${JSON.stringify(bids[0])}`);
            
            console.log(`  > Asks (NO?):  ${asks.length} levels`);
            if (asks.length > 0) console.log(`    Top Ask: ${JSON.stringify(asks[0])}`);

            // Consistency Check with Market Summary
            const marketInfo = markets.find((mk: any) => mk.ticker === ticker);
            if (marketInfo) {
                const marketYesBid = marketInfo.yes_bid; // From market list
                const marketYesAsk = marketInfo.yes_ask; // From market list
                
                const derivedYesBid = bids.length > 0 ? bids[0].price * 100 : null; // Cents
                const derivedYesAsk = asks.length > 0 ? asks[0].price * 100 : null; // Cents
                
                // Allow small difference or type mismatch, so loose comparison
                // But generally they should match exactly if data is fresh.
                
                if (derivedYesBid !== marketYesBid) {
                     console.warn(`    [WARN] Consistency Mismatch Bid: Derived=${derivedYesBid}, Market=${marketYesBid}`);
                } else {
                     console.log(`    [OK] Consistency Bid: ${derivedYesBid}`);
                }
                
                if (derivedYesAsk !== marketYesAsk) {
                     console.warn(`    [WARN] Consistency Mismatch Ask: Derived=${derivedYesAsk}, Market=${marketYesAsk}`);
                } else {
                     console.log(`    [OK] Consistency Ask: ${derivedYesAsk}`);
                }
            }

            // Special check for target ticker
            if (ticker === targetTicker) {
                console.log('  *** TARGET TICKER VERIFICATION ***');
                console.log('  Derived Best YES Bid:', bids.length > 0 ? bids[0] : 'None');
                console.log('  Derived Best YES Ask:', asks.length > 0 ? asks[0] : 'None');
                console.log('  Full Bids:', JSON.stringify(bids.slice(0, 5)));
                console.log('  Full Asks:', JSON.stringify(asks.slice(0, 5)));
            }

        } else {
            console.error(`  Failed to fetch orderbook: ${obRes.final.error_message} (Stage: ${obRes.final.error_code})`);
        }
    }
}

main().catch(console.error);
