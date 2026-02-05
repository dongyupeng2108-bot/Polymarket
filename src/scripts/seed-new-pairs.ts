
import { prisma } from '../lib/db';

const pairs = [
  // A. FOMC
  {
    title_pm: 'Fed Jan meeting Cut 25bps?',
    pm_slug: 'fed-decision-in-january', // Not ID, need to resolve
    pm_outcome: 'Cut 25',
    kh_ticker: 'kxfeddecision-26jan',
    kh_sub: 'Cut of 25bps',
    tags: ['FOMC', 'Macro']
  },
  {
    title_pm: 'Fed Jan meeting No change?',
    pm_slug: 'fed-decision-in-january',
    pm_outcome: 'No change',
    kh_ticker: 'kxfeddecision-26jan', // Assuming same market, different strike? Or different ticker? 
    // KH tickers are usually specific to contract series. 
    // Wait, kxfeddecision-26jan is the SERIES ticker? Or specific contract?
    // Kalshi API uses "ticker" for specific market?
    // User said: "KH: kxfeddecision-26jan (contract: Cut of 25bps)"
    // This implies kxfeddecision-26jan is the series/event ticker, and we need to filter by subtitle?
    // Our adapter expects 'kh_market_id' to be the Ticker.
    // If 'kxfeddecision-26jan' is the ticker, does it return multiple lines?
    // Usually Kalshi markets are 1 ticker = 1 Yes/No question.
    // Maybe 'kxfeddecision-26jan-cut25'?
    // I will use what user provided: 'kxfeddecision-26jan' and store subtitle in rules/notes.
    kh_sub: 'Hike of 0bps', 
    tags: ['FOMC', 'Macro']
  },
  {
    title_pm: 'Fed Jan meeting Hike 25bps?',
    pm_slug: 'fed-decision-in-january',
    pm_outcome: '25+ bps increase',
    kh_ticker: 'kxfeddecision-26jan',
    kh_sub: 'Hike of 25bps',
    tags: ['FOMC', 'Macro']
  },
  // B. CPI
  {
    title_pm: 'Jan CPI YoY > 2.4%?',
    pm_slug: 'january-inflation-us-annual',
    pm_outcome: '>2.4',
    kh_ticker: 'kxcpiyoy-26jan',
    kh_sub: 'more than 2.4%',
    tags: ['CPI', 'Macro']
  },
  {
    title_pm: 'Jan CPI MoM > 0.2%?',
    pm_slug: 'january-inflation-us-monthly',
    pm_outcome: '>0.2', // Assumption
    kh_ticker: 'kxeconstatcpi-26jan',
    kh_sub: 'more than 0.2%',
    tags: ['CPI', 'Macro']
  },
  {
    title_pm: 'Jan Core CPI',
    pm_slug: 'core-cpi-jan', // Placeholder
    pm_outcome: 'Yes',
    kh_ticker: 'kxcpicore-26jan',
    kh_sub: '',
    tags: ['CPI', 'Macro']
  },
  // C. Employment
  {
    title_pm: 'Jan U-3 unemployment > 4.0%?',
    pm_slug: 'january-unemployment-rate',
    pm_outcome: '>4.0',
    kh_ticker: 'kxu3-26jan',
    kh_sub: '',
    tags: ['Employment', 'Macro']
  },
  {
    title_pm: 'Jan NFP > 150k?',
    pm_slug: 'how-many-jobs-added-in-january',
    pm_outcome: '>150k',
    kh_ticker: 'kxpayrolls-26jan',
    kh_sub: '',
    tags: ['Employment', 'Macro']
  },
  {
    title_pm: 'Annual U-3 max >= 5.5%?',
    pm_slug: 'how-high-will-us-unemployment-go-in-2026',
    pm_outcome: '>= 5.5%',
    kh_ticker: 'kxunemploymentmax-26',
    kh_sub: '',
    tags: ['Employment', 'Macro']
  },
  // D. GDP
  {
    title_pm: 'GDP Q4 2025 > 2.0%?',
    pm_slug: 'us-gdp-growth-in-q4-2025',
    pm_outcome: '>2.0%',
    kh_ticker: 'kxgdp-26jan30',
    kh_sub: '',
    tags: ['GDP', 'Macro']
  }
];

async function main() {
  console.log('Seeding new binary pairs...');

  for (const p of pairs) {
    // We insert as draft because IDs are placeholders/slugs
    // Real implementation would fetch IDs here
    
    await prisma.pair.create({
      data: {
        pm_yes_token_id: `SLUG:${p.pm_slug}:${p.pm_outcome}`, // Storing slug as ID for now, Scanner will fail if not handled
        kh_ticker: p.kh_ticker,
        title_pm: p.title_pm,
        title_kh: `KH ${p.kh_ticker}`,
        resolve_time_pm: new Date('2026-02-01'), // Dummy
        resolve_time_kh: new Date('2026-02-01'),
        rules_pm: `Outcome: ${p.pm_outcome}`,
        rules_kh: `Contract: ${p.kh_sub}`,
        status: 'draft', // User must verify or we must resolve IDs
        tags: [...p.tags, 'manual-import'],
        confidence: 0.9
      }
    });
    console.log(`Created (Draft): ${p.title_pm}`);
  }
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
