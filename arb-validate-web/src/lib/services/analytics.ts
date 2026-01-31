import { prisma } from '../db';

export async function getDashboardStats() {
  try {
    const totalPairs = await prisma.pair.count();
    const verifiedPairs = await prisma.pair.count({ where: { status: 'verified' } });
    const unverifiedPairs = totalPairs - verifiedPairs;
    
    // Scan Counts
    const scanCountTotal = await prisma.scanRun.count({
        where: { status: 'completed' } // Only count successful runs
    });

    // Last Opportunity Scan
    const lastScan = await prisma.scanRun.findFirst({
        where: { status: 'completed' }, // Assuming all current runs are opp scans
        orderBy: { id: 'desc' }
    });

    let lastOppsScan = null;
    if (lastScan) {
        // Count opportunities found during this run
        // We add a small buffer to end time to ensure we catch all
        const endTime = lastScan.completed_at || new Date();
        const oppCount = await prisma.opportunity.count({
            where: {
                ts: {
                    gte: lastScan.started_at,
                    lte: endTime
                }
            }
        });

        // Get settings to determine threshold
        // Note: Ideally we should store settings snapshot in ScanRun. 
        // For now, we use current settings as proxy or if we can't find them, default.
        const settings = await prisma.settings.findFirst();
        const netEvThreshold = settings?.min_profit_usd || 0;

        const countNetEvAbove = await prisma.opportunity.count({
            where: {
                ts: {
                    gte: lastScan.started_at,
                    lte: endTime
                },
                profit_total: {
                    gte: netEvThreshold
                }
            }
        });

        lastOppsScan = {
            run_id: lastScan.id,
            completed_at: lastScan.completed_at,
            opportunities_total: oppCount,
            net_ev_threshold: netEvThreshold,
            count_net_ev_above_threshold: countNetEvAbove
        };
    }

    // Last Pair Scan (Not yet implemented in backend, return null placeholder)
    // Future: Query a different table or ScanRun with type='pair_discovery'
    const lastPairScan = null; 

    // Legacy support (optional, can remove if frontend doesn't need them anymore)
    const recentOpportunities = await prisma.opportunity.findMany({
      take: 5,
      orderBy: { ts: 'desc' },
      include: { pair: true },
    });

    return {
      totalPairs,
      verifiedPairs,
      unverifiedPairs,
      scanCountTotal, // Replaces totalSnapshots concept in UI
      lastOppsScan,
      lastPairScan,
      recentOpportunities, // Keep for "Recent Opportunities" table if needed
    };
  } catch (e) {
    console.error("Error fetching dashboard stats:", e);
    return {
      totalPairs: 0,
      verifiedPairs: 0,
      unverifiedPairs: 0,
      scanCountTotal: 0,
      lastOppsScan: null,
      lastPairScan: null,
      recentOpportunities: [],
    };
  }
}
