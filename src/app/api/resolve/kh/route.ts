
import { NextRequest, NextResponse } from 'next/server';

const KALSHI_API = 'https://api.elections.kalshi.com/trade-api/v2';

export async function POST(req: NextRequest) {
  try {
    const { input } = await req.json();
    let ticker = input;

    // Extract ticker from URL
    if (input.includes('kalshi.com/markets/')) {
        const parts = input.split('kalshi.com/markets/');
        ticker = parts[1].split('/')[0].split('?')[0];
    }

    if (!ticker) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

    // Fetch Market
    // Try /markets/{ticker}
    const res = await fetch(`${KALSHI_API}/markets/${ticker}`);
    if (!res.ok) {
        return NextResponse.json({ error: `Kalshi API error: ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    const market = data.market;

    if (!market) {
         return NextResponse.json({ error: 'Market not found' }, { status: 404 });
    }

    // Contracts
    // Kalshi markets usually have one contract for simple YES/NO?
    // Or multiple?
    // If it's a series, we might get multiple?
    // But /markets/{ticker} returns a single market object usually.
    // Wait, Kalshi structure: Event -> Series -> Market -> Market (Contract?)
    // "ticker" usually refers to a specific market (e.g. KXFED-23DEC-5.00).
    // If so, it has `yes_bid`, `no_bid` etc.
    // Does it have "contracts"?
    // No, the Market IS the contract essentially (Yes/No).
    // So if user provides a market ticker, we just confirm it.
    // But user wants "Select YES".
    // Kalshi markets are binary. So outcomes are always Yes/No.
    // We just need to verify the ticker is valid and get title.
    
    // However, if user provides SERIES ticker (e.g. KXFED), we might want to list all markets in series?
    // Let's assume user provides specific Market Ticker for now.
    
    return NextResponse.json({
        title: market.title,
        ticker: market.ticker,
        contracts: [
            { label: 'Yes', id: market.ticker }, // Kalshi uses ticker as ID for the market
            { label: 'No', id: market.ticker }   // Same ID, different side
        ]
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
