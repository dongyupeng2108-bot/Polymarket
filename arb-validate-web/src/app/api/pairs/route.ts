
import { NextRequest, NextResponse } from 'next/server';
import { createPair, getPairs } from '@/lib/services/pairs';

export async function GET() {
  const pairs = await getPairs();
  return NextResponse.json(pairs);
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const pair = await createPair(data);
    return NextResponse.json(pair);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
