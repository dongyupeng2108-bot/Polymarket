import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  const status = await prisma.systemStatus.findFirst();
  const settings = await prisma.settings.findFirst();
  
  return NextResponse.json({
    running: settings?.task_enabled || false,
    ...status
  });
}
