
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Create a verified pair for testing
  const pair = await prisma.pair.upsert({
    where: { id: 1 }, // Assuming ID 1 or unique constraint on market IDs
    update: {},
    create: {
      pm_yes_token_id: '47908883921703636531533488566060476025596476739662867284619056260737335618197', // Example ID
      pm_market_slug: 'cpi-january-2026',
      pm_market_id: '0x123',
      pm_open_url: 'https://polymarket.com/event/cpi-january-2026',
      kh_ticker: 'KXGDP-26JAN30', // Use a real ticker if possible, or this one for test
      kh_open_url: 'https://kalshi.com/markets/kxgdp-26jan30',
      title_pm: 'CPI January 2026',
          title_kh: 'CPI January 2026',
          status: 'verified',
          is_binary: true,
          resolve_time_pm: new Date('2026-01-30T00:00:00Z'),
          resolve_time_kh: new Date('2026-01-30T00:00:00Z'),
          rules_pm: 'PM Rules',
          rules_kh: 'KH Rules'
        }
      });
  console.log('Seeded Pair:', pair);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
