
import { NextRequest, NextResponse } from 'next/server';
import { scanPair } from '@/lib/services/scanner';

export async function POST(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const pairIdStr = searchParams.get('pairId');
    
    if (!pairIdStr) {
        return NextResponse.json({ error: 'Missing pairId' }, { status: 400 });
    }
    
    const pairId = parseInt(pairIdStr, 10);
    const result = await scanPair(pairId);
    
    if (result.status === 'fail') {
        return NextResponse.json(result, { status: 500 });
    }
    
    return NextResponse.json(result);
}
