
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const count = await prisma.pair.count();
  console.log('Pair count:', count);
  const pairs = await prisma.pair.findMany();
  pairs.forEach(p => console.log(`- ${p.title_pm} (ID: ${p.pm_market_id})`));
}

check().catch(console.error).finally(() => prisma.$disconnect());
