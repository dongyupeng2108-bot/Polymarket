
import { prisma } from '../lib/db';

async function checkStatus() {
    const status = await prisma.systemStatus.findFirst();
    console.log('System Status:', status);

    const pair44 = await prisma.pair.findUnique({
        where: { id: 44 },
        include: { evaluations: { orderBy: { ts: 'desc' }, take: 1 } }
    });
    
    console.log('Pair #44 (Jan CPI MoM):', pair44?.title_pm);
    console.log('  Status:', pair44?.status);
    console.log('  Last Eval:', pair44?.evaluations[0]);

    const latestEval = await prisma.evaluation.findFirst({
        orderBy: { ts: 'desc' },
        include: { pair: true }
    });
    console.log('Latest Evaluation in DB:', latestEval?.pair.title_pm, latestEval?.ts);
}

checkStatus()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
