import { PrismaClient } from '@prisma/client';

// Handle BigInt serialization for JSON.stringify
// @ts-ignore
BigInt.prototype.toJSON = function() { return this.toString() }

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ['query'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
