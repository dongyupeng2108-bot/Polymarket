import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { simulateTrade } from '@/lib/sim/simulate';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const showAll = searchParams.get('all') === 'true';
  const limit = Number(searchParams.get('limit')) || 50;
  const eventTicker = searchParams.get('eventTicker');

  // Helper to attach simulation
  const attachSimulation = (item: any) => {
      // Latency is not stored in DB, assume 0 for historical view
      // In real ScanResult (live), we have latency.
      const sim = simulateTrade({
          pm_bid: item.pm_price_bid ?? null,
          pm_ask: item.pm_price_ask ?? null,
          kh_bid: item.kh_price_bid ?? null,
          kh_ask: item.kh_price_ask ?? null,
          pm_latency_ms: 0, 
          kh_latency_ms: 0
      });
      return { ...item, simulation: sim };
  };

  const whereClause = eventTicker ? {
      pair: {
          kh_ticker: eventTicker
      }
  } : {};

  if (showAll) {
      const evaluations = await prisma.evaluation.findMany({
          where: whereClause,
          take: limit,
          orderBy: { ts: 'desc' },
          include: { pair: true }
      });
      const withSim = evaluations.map(attachSimulation);
      return NextResponse.json(withSim);
  } else {
      const opportunities = await prisma.opportunity.findMany({
          where: whereClause,
          take: limit,
          orderBy: { ts: 'desc' },
          include: { pair: true }
      });
      // Opportunity table structure matches Evaluation for price fields?
      // Check schema or assume consistency. Usually Opportunity is a copy.
      // If Opportunity table lacks price fields, we might need to fetch related Evaluation.
      // But typically it has them.
      const withSim = opportunities.map(attachSimulation);
      return NextResponse.json(withSim);
  }
}
