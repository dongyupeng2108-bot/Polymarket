import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST() {
  await prisma.settings.updateMany({
    where: { id: 1 },
    data: { task_enabled: false }
  });
  
  return NextResponse.json({ success: true, message: 'Task disabled' });
}
