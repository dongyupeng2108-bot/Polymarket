
import { NextResponse } from 'next/server';
import { getRuntimeConfig } from '@/lib/config/runtime';

export async function GET() {
    const config = getRuntimeConfig();
    return NextResponse.json(config);
}
