
import { NextRequest, NextResponse } from 'next/server';
import { checkKalshiHealth } from '@/lib/services/kalshi-diagnostics';

export async function GET(request: NextRequest) {
    const result = await checkKalshiHealth(false); // No details
    return NextResponse.json(result);
}
