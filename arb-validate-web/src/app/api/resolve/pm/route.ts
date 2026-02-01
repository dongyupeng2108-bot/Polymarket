
import { NextRequest, NextResponse } from 'next/server';
import { fetchWithPowerShell } from '@/lib/utils/powershell-fetch';

const GAMMA_URL = 'https://gamma-api.polymarket.com';

export async function POST(req: NextRequest) {
  try {
    const { input } = await req.json();
    let slug = input;

    // Extract slug from URL
    if (input.includes('polymarket.com/event/')) {
        const parts = input.split('polymarket.com/event/');
        slug = parts[1].split('/')[0].split('?')[0];
    }

    if (!slug) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

    // Fetch Event
    let eventData = await fetchWithPowerShell(`${GAMMA_URL}/events?slug=${slug}`);
    if (eventData && eventData.value) eventData = eventData.value;
    const eventList = Array.isArray(eventData) ? eventData : (eventData ? [eventData] : []);

    if (eventList.length === 0) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = eventList[0];
    const markets = [];

    if (event.markets) {
        let ms = (event.markets.value && Array.isArray(event.markets.value)) ? event.markets.value : event.markets;
        if (!Array.isArray(ms)) ms = [ms];

        for (const m of ms) {
            const actualM = (m.value && !m.question) ? m.value : m;
            
            // Extract outcomes
            let outcomes: string[] = [];
            let tokens: string[] = [];
            
            try {
                outcomes = typeof actualM.outcomes === 'string' ? JSON.parse(actualM.outcomes) : actualM.outcomes;
                tokens = typeof actualM.clobTokenIds === 'string' ? JSON.parse(actualM.clobTokenIds) : actualM.clobTokenIds;
            } catch (e) {}

            if (outcomes && tokens && outcomes.length === tokens.length) {
                const tokenList = outcomes.map((label, idx) => ({
                    label,
                    tokenId: tokens[idx]
                }));
                markets.push({
                    question: actualM.question,
                    tokens: tokenList
                });
            }
        }
    }

    return NextResponse.json({
        title: event.title,
        slug: slug,
        markets: markets
    });

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
