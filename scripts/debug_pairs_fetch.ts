
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        console.log('Fetching pairs...');
        const pairs = await prisma.pair.findMany({
            orderBy: { created_at: 'desc' },
            include: {
                evaluations: {
                    take: 1,
                    orderBy: { ts: 'desc' },
                    select: { reason: true }
                }
            }
        });
        console.log(`Successfully fetched ${pairs.length} pairs.`);
    } catch (e) {
        console.error('Error fetching pairs:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
