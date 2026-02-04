
import { prisma } from '../lib/db';

async function main() {
  console.log('Cleaning up UNVERIFIED pairs...');
  
  const { count } = await prisma.pair.deleteMany({
    where: { status: 'unverified' }
  });

  console.log(`Deleted ${count} unverified pairs.`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
