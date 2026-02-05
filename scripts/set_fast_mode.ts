
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Switching Arbitrage Scanner to FAST Mode ---');
    
    // Set poll interval to 5 seconds (aggressive)
    const settings = await prisma.settings.upsert({
        where: { id: 1 },
        update: { poll_interval_sec: 5 },
        create: { poll_interval_sec: 5 }
    });
    
    console.log(`✅ Poll Interval updated to: ${settings.poll_interval_sec} seconds`);
    console.log('The worker will pick up this change in the next cycle.');
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
