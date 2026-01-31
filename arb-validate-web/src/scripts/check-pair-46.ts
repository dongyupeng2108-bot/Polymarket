
import { prisma } from '../lib/db';

async function check() {
    const pair = await prisma.pair.findUnique({ where: { id: 46 } });
    console.log(pair ? 'Pair #46 EXISTS' : 'Pair #46 DELETED');
}

check().finally(() => prisma.$disconnect());
