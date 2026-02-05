import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log("Verifying AutoMatch Fixes...");
  
  // 1. Verify DB Fallback Capability (Check if pairs exist with kh_ticker)
  try {
    const dbPairsCount = await prisma.pair.count({
      where: { kh_ticker: { not: null } }
    });
    console.log(`DB Pairs with kh_ticker: ${dbPairsCount}`);
    
    if (dbPairsCount === 0) {
      console.warn("WARNING: No pairs with kh_ticker found in DB. DB Fallback might fail if invoked.");
      // Not strictly failing the script if DB is empty in dev, but logically fallback requires data.
    } else {
      console.log("PASS: DB has pairs for fallback.");
    }
  } catch (e) {
    console.error("DB Connection Failed:", e);
    // If DB fails, we fail the verification
    process.exit(1);
  }

  // 2. Verify Code Changes (Static Analysis of route.ts)
  const routePath = path.join(process.cwd(), 'src/app/api/pairs/auto-match/stream/route.ts');
  if (!fs.existsSync(routePath)) {
      console.error(`FAIL: route.ts not found at ${routePath}`);
      process.exit(1);
  }
  const routeContent = fs.readFileSync(routePath, 'utf-8');
  
  const requiredStrings = [
    'stats.scanned = pmEvents.length', // Fix A
    'isDegraded = true', // Fix B
    'is_low_confidence: true', // Fix C
    'finalReason' // Fix D
  ];

  for (const str of requiredStrings) {
    if (!routeContent.includes(str)) {
      console.error(`FAIL: Missing required code change: "${str}"`);
      process.exit(1);
    }
  }

  console.log("PASS: Code changes verified.");
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
