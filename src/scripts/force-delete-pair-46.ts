
import { prisma } from '../lib/db';

async function forceDelete46() {
    const id = 46;
    console.log(`[Script] Attempting to force delete Pair #${id}...`);

    // Check if pair exists
    const pair = await prisma.pair.findUnique({ where: { id } });
    if (!pair) {
        console.log(`Pair #${id} not found.`);
        return;
    }
    console.log(`Found Pair #${id}: ${pair.title_pm}`);

    // Check dependencies
    const opps = await prisma.opportunity.count({ where: { pair_id: id } });
    console.log(`- Opportunities: ${opps}`);
    
    const snaps = await prisma.snapshot.count({ where: { pair_id: id } });
    console.log(`- Snapshots: ${snaps}`);
    
    const evals = await prisma.evaluation.count({ where: { pair_id: id } });
    console.log(`- Evaluations: ${evals}`);

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Delete Opportunities
            await tx.opportunity.deleteMany({ where: { pair_id: id } });
            console.log('Deleted Opportunities');

            // 2. Find Snapshots
            const snapshots = await tx.snapshot.findMany({ 
                where: { pair_id: id },
                select: { id: true }
            });
            const snapshotIds = snapshots.map(s => s.id);
            console.log(`Found Snapshot IDs: ${snapshotIds.length}`);

            // 3. Delete Evaluations by Snapshot ID
            if (snapshotIds.length > 0) {
                const res = await tx.evaluation.deleteMany({ 
                    where: { snapshot_id: { in: snapshotIds } } 
                });
                console.log(`Deleted ${res.count} evaluations via snapshot_id`);
            }

            // 4. Delete Evaluations by Pair ID
            const resEval = await tx.evaluation.deleteMany({ where: { pair_id: id } });
            console.log(`Deleted ${resEval.count} evaluations via pair_id`);

            // 5. Delete Snapshots
            await tx.snapshot.deleteMany({ where: { pair_id: id } });
            console.log('Deleted Snapshots');

            // 6. Delete Pair
            await tx.pair.delete({ where: { id } });
            console.log('Deleted Pair');
        });
        console.log('SUCCESS: Pair #46 deleted.');
    } catch (e: any) {
        console.error('FAILURE:', e);
    }
}

forceDelete46()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
