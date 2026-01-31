
import { prisma } from '../lib/db';

async function testDelete() {
    // Create dummy pair
    const p = await prisma.pair.create({
        data: {
            title_pm: 'Test Delete',
            title_kh: 'Test Delete',
            resolve_time_pm: new Date(),
            resolve_time_kh: new Date(),
            rules_pm: '',
            rules_kh: ''
        }
    });
    console.log(`Created Pair #${p.id}`);
    
    // Add dummy dependencies
    const s = await prisma.snapshot.create({
        data: {
            pair_id: p.id,
            pm_book: {},
            kh_book: {}
        }
    });
    console.log(`Created Snapshot #${s.id}`);
    
    await prisma.evaluation.create({
        data: {
            pair_id: p.id,
            snapshot_id: s.id,
            is_opportunity: false
        }
    });
    console.log(`Created Evaluation`);
    
    // Call DELETE API Logic (Simulated)
    try {
        console.log('Attempting deletion...');
        await prisma.$transaction(async (tx) => {
            await tx.opportunity.deleteMany({ where: { pair_id: p.id } });
            await tx.evaluation.deleteMany({ where: { pair_id: p.id } });
            await tx.snapshot.deleteMany({ where: { pair_id: p.id } });
            await tx.pair.delete({ where: { id: p.id } });
        });
        console.log('Deletion Successful!');
    } catch (e) {
        console.error('Deletion Failed:', e);
    }
}

testDelete()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
