import { prisma } from '../db';
import { Pair, PairStatus, Prisma } from '@prisma/client';

export type PairWithReason = Pair & { unverified_reason: string | null };

export async function getPairs(status?: PairStatus): Promise<PairWithReason[]> {
  const where: Prisma.PairWhereInput = status ? { status } : {};
  const pairs = await prisma.pair.findMany({
    where,
    orderBy: { created_at: 'desc' },
    include: {
      evaluations: {
        take: 1,
        orderBy: { ts: 'desc' },
        select: { reason: true }
      }
    }
  });

  return pairs.map(p => {
    // We need to omit 'evaluations' from the result to match PairWithReason cleanly, 
    // or just let it be extra. For cleanliness, we'll cast.
    const { evaluations, ...rest } = p;
    return {
      ...rest,
      unverified_reason: evaluations[0]?.reason || null
    };
  });
}

export async function getPairById(id: number) {
  return prisma.pair.findUnique({
    where: { id },
  });
}

export async function createPair(data: {
  pm_yes_token_id: string | null;
  pm_no_token_id: string | null;
  pm_market_slug: string | null;
  pm_market_id?: string | null; // Added
  pm_open_url?: string | null; // Added
  kh_ticker: string | null;
  kh_yes_contract_id: string | null;
  kh_no_contract_id: string | null;
  kh_open_url?: string | null; // Added
  title_pm: string;
  title_kh: string;
  resolve_time_pm?: Date;
  resolve_time_kh?: Date;
  rules_pm?: string;
  rules_kh?: string;
  tags?: string[];
  notes?: string;
  status?: PairStatus;
}) {
  return prisma.pair.create({
    data: {
      ...data,
      // Defaults if missing
      resolve_time_pm: data.resolve_time_pm || new Date(),
      resolve_time_kh: data.resolve_time_kh || new Date(),
      rules_pm: data.rules_pm || '',
      rules_kh: data.rules_kh || '',
      status: data.status || 'unverified',
      confidence: 0,
    },
  });
}

export async function updatePairStatus(id: number, status: PairStatus) {
  return prisma.pair.update({
    where: { id },
    data: { status },
  });
}
