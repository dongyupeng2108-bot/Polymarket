
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);
    
    if (isNaN(id)) {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }
    const data = await req.json();

    const updated = await prisma.pair.update({
        where: { id },
        data: {
            title_pm: data.title_pm,
            title_kh: data.title_kh,
            status: data.status,
            notes: data.notes,
            pm_yes_token_id: data.pm_yes_token_id,
            kh_ticker: data.kh_ticker,
            pm_open_url: data.pm_open_url,
            kh_open_url: data.kh_open_url
        }
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: idStr } = await params;
    const id = parseInt(idStr);

    if (isNaN(id)) {
        return NextResponse.json({ error: 'Invalid ID' }, { status: 400 });
    }
    console.log(`[API] Deleting Pair #${id}...`);
    
    await prisma.$transaction(async (tx) => {
        // 1. Delete Opportunities (depends on Pair)
        const opps = await tx.opportunity.deleteMany({ where: { pair_id: id } });
        console.log(`  Deleted ${opps.count} opportunities`);

        // 2. Find Snapshots to ensure we delete ALL dependent evaluations
        // (Even if data corruption caused pair_id mismatch in evaluations)
        const snapshots = await tx.snapshot.findMany({
            where: { pair_id: id },
            select: { id: true }
        });
        const snapshotIds = snapshots.map(s => s.id);

        if (snapshotIds.length > 0) {
            const evalsBySnap = await tx.evaluation.deleteMany({
                where: { snapshot_id: { in: snapshotIds } }
            });
            console.log(`  Deleted ${evalsBySnap.count} evaluations by snapshot_id`);
        }

        // 3. Delete any remaining Evaluations by pair_id
        const evalsByPair = await tx.evaluation.deleteMany({ where: { pair_id: id } });
        console.log(`  Deleted ${evalsByPair.count} evaluations by pair_id`);

        // 4. Delete Snapshots (depends on Pair)
        const snaps = await tx.snapshot.deleteMany({ where: { pair_id: id } });
        console.log(`  Deleted ${snaps.count} snapshots`);

        // 5. Delete Pair
        await tx.pair.delete({ where: { id } });
        console.log(`  Deleted Pair #${id}`);
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(`[API] Delete Pair Error:`, e);
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
  }
}
