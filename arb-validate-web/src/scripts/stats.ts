import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Opportunity Statistics ---');

  // Get all opportunities
  const opportunities = await prisma.opportunity.findMany({
    orderBy: { ts: 'asc' },
    include: { pair: true }
  });

  if (opportunities.length === 0) {
    console.log('No opportunities recorded yet.');
    return;
  }

  // Group by pair
  const byPair: Record<string, typeof opportunities> = {};
  for (const op of opportunities) {
    const key = op.pair.title_pm; // Or ID
    if (!byPair[key]) byPair[key] = [];
    byPair[key].push(op);
  }

  for (const [pairTitle, ops] of Object.entries(byPair)) {
    console.log(`\nPair: ${pairTitle}`);
    
    // Avg Edge
    const avgEdge = ops.reduce((sum, op) => sum + op.edge_pct, 0) / ops.length;
    console.log(`  Frequency: ${ops.length} events`);
    console.log(`  Avg Edge: ${(avgEdge * 100).toFixed(4)}%`); // edge_pct is raw difference? Evaluator saves raw difference.

    // Duration (consecutive timestamps)
    // Simple heuristic: if diff < 20s (poll interval 15s), it's same event.
    let durations: number[] = [];
    let currentStart = ops[0].ts.getTime();
    let currentEnd = ops[0].ts.getTime();

    for (let i = 1; i < ops.length; i++) {
      const ts = ops[i].ts.getTime();
      if (ts - currentEnd < 20000) { // 20s tolerance
        currentEnd = ts;
      } else {
        durations.push(currentEnd - currentStart);
        currentStart = ts;
        currentEnd = ts;
      }
    }
    durations.push(currentEnd - currentStart); // Last one

    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
    console.log(`  Avg Duration: ${(avgDuration / 1000).toFixed(2)}s`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
