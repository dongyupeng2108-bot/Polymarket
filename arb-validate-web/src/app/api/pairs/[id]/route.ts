
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
    
    // Fetch current pair to get identifiers for renaming (Soft Delete)
    const current = await prisma.pair.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: 'Pair not found' }, { status: 404 });

    await prisma.$transaction(async (tx) => {
        // 1. Delete Heavy Dependent Data (Clear state, keep history in Pair)
        const opps = await tx.opportunity.deleteMany({ where: { pair_id: id } });
        console.log(`  Deleted ${opps.count} opportunities`);

        // Delete Snapshots & Evaluations to free space
        const snapshots = await tx.snapshot.findMany({
            where: { pair_id: id },
            select: { id: true }
        });
        const snapshotIds = snapshots.map(s => s.id);

        if (snapshotIds.length > 0) {
            await tx.evaluation.deleteMany({
                where: { snapshot_id: { in: snapshotIds } }
            });
        }
        await tx.evaluation.deleteMany({ where: { pair_id: id } });
        await tx.snapshot.deleteMany({ where: { pair_id: id } });

        // 2. Soft Delete Pair & Release Unique Constraint
        // Use 'as any' to bypass potential missing type in generated client
        const ts = Date.now();
        await (tx.pair as any).update({
            where: { id },
            data: {
                deleted_at: new Date(),
                status: 'unverified',
                // Rename identifiers to allow re-creation of same pair later
                pm_market_id: current.pm_market_id ? `${current.pm_market_id}_del_${ts}` : null,
                kh_ticker: current.kh_ticker ? `${current.kh_ticker}_del_${ts}` : null
            }
        });
        console.log(`  Soft Deleted Pair #${id} (renamed to avoid unique constraint)`);
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(`[API] Delete Pair Error:`, e);
    return NextResponse.json({ error: e.message || 'Unknown error' }, { status: 500 });
  }
}
