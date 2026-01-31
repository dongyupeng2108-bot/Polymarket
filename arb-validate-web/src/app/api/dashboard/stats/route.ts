import { NextResponse } from 'next/server';
import { getDashboardStats } from '@/lib/services/analytics';

export const dynamic = 'force-dynamic';

export async function GET() {
  const stats = await getDashboardStats();
  return NextResponse.json(stats, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
}
