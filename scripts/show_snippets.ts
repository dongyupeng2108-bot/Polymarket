
import fs from 'fs';
import path from 'path';

const pmPath = path.resolve(__dirname, '../reports/top_by_category_pm.json');
const khPath = path.resolve(__dirname, '../reports/top_by_category_kalshi.json');

const pmData = JSON.parse(fs.readFileSync(pmPath, 'utf-8'));
const khData = JSON.parse(fs.readFileSync(khPath, 'utf-8'));

const categories = Object.keys(pmData);

console.log('--- Snippets (Top 2 per Category) ---');

categories.forEach(cat => {
    console.log(`\n### ${cat}`);
    
    // PM
    const pmItems = pmData[cat] || [];
    console.log(`[PM] (Total: ${pmItems.length})`);
    pmItems.slice(0, 2).forEach((item: any, idx: number) => {
        console.log(`  ${idx + 1}. id=${item.id} | slug=${item.slug} | vol=${Math.round(item.volume)} | tags=${JSON.stringify(item.tags)}`);
    });

    // Kalshi
    const khItems = khData[cat] || [];
    console.log(`[Kalshi] (Total: ${khItems.length})`);
    khItems.slice(0, 2).forEach((item: any, idx: number) => {
        console.log(`  ${idx + 1}. ticker=${item.ticker} | title=${item.title} | vol=${Math.round(item.volume)} | cat=${item.category} | tags=${JSON.stringify(item.tags)}`);
    });
});
