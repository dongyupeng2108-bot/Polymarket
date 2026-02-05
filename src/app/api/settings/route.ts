
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const settings = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 }
  });
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const settings = await prisma.settings.update({
      where: { id: 1 },
      data: {
        light_verify_enabled: body.light_verify_enabled,
        deep_verify_schedule_h: parseInt(body.deep_verify_schedule_h),
        verified_ttl_days: parseInt(body.verified_ttl_days),
        failure_demotion_count: parseInt(body.failure_demotion_count),
        // Allow updating other fields if needed, but for now focus on verification
      }
    });
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Settings update error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
