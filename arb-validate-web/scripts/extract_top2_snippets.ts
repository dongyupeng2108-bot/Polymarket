import fs from 'fs';
import path from 'path';

const OUTPUT_DIR = path.resolve(__dirname, '../reports');

const pmPath = path.join(OUTPUT_DIR, 'top_by_category_pm.json');
const kalshiPath = path.join(OUTPUT_DIR, 'top_by_category_kalshi.json');

if (!fs.existsSync(pmPath) || !fs.existsSync(kalshiPath)) {
    console.error('Files not found. Run manual_probe_top_by_category.ts first.');
    process.exit(1);
}

const pmData = JSON.parse(fs.readFileSync(pmPath, 'utf-8'));
const kalshiData = JSON.parse(fs.readFileSync(kalshiPath, 'utf-8'));

const CATEGORIES = [
    'Politics', 'Sports', 'Crypto', 'Finance', 'Geopolitics',
    'Earnings', 'Tech', 'Culture', 'World', 'Economy'
];

console.log('--- Top 2 Snippets per Category ---');

CATEGORIES.forEach(cat => {
    console.log(`\n### Category: ${cat}`);
    
    // PM
    const pmItems = pmData[cat] || [];
    console.log(`  [PM] (Total: ${pmItems.length})`);
    pmItems.slice(0, 2).forEach((m: any, i: number) => {
        console.log(`    ${i+1}. ID: ${m.id}`);
        console.log(`       Title: ${m.title}`);
        console.log(`       Slug: ${m.slug}`);
        console.log(`       Tags: ${JSON.stringify(m.tags)}`);
        console.log(`       Fetch Info: ${m.fetch_info}`);
    });

    // Kalshi
    const kalshiItems = kalshiData[cat] || [];
    console.log(`  [Kalshi] (Total: ${kalshiItems.length})`);
    kalshiItems.slice(0, 2).forEach((m: any, i: number) => {
        console.log(`    ${i+1}. Ticker: ${m.id}`);
        console.log(`       Title: ${m.title}`);
        console.log(`       Category: ${m.category}`);
        console.log(`       Tags: ${JSON.stringify(m.tags)}`);
        console.log(`       Fetch Info: ${m.fetch_info}`);
    });
});
