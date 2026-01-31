import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST() {
  await prisma.settings.upsert({
    where: { id: 1 },
    update: { task_enabled: true },
    create: { task_enabled: true }
  });
  
  // Trigger immediate scan signal if possible, but worker polling DB is safer
  // For immediate execution, we could try to call a server action or webhook, 
  // but since worker is external process, DB polling is the way.
  
  return NextResponse.json({ success: true, message: 'Task enabled' });
}
