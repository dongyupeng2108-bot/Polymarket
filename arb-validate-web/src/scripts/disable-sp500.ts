
import { prisma } from '../lib/db';

async function main() {
  console.log('Disabling S&P500 pairs...');
  
  // Find pairs with S&P500 in title or tags
  const pairs = await prisma.pair.findMany({
    where: {
      OR: [
        { title_pm: { contains: 'S&P500' } },
        { title_pm: { contains: 'SP500' } },
        { tags: { hasSome: ['S&P500', 'SP500'] } }
      ]
    }
  });

  console.log(`Found ${pairs.length} pairs to disable.`);

  for (const p of pairs) {
    await prisma.pair.update({
      where: { id: p.id },
      data: { status: 'unverified', notes: 'Disabled by user request (Not Binary / Multi-Outcome)' }
    });
    console.log(`Disabled Pair #${p.id}: ${p.title_pm}`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
