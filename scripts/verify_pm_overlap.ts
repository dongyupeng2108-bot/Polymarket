
import fs from 'fs';
import path from 'path';

const REPORT_DIR = path.join(process.cwd(), 'reports');
const PM_FILE = path.join(REPORT_DIR, 'top_by_category_pm.json');

if (!fs.existsSync(PM_FILE)) {
    console.error(`File not found: ${PM_FILE}`);
    process.exit(1);
}

const data = JSON.parse(fs.readFileSync(PM_FILE, 'utf8'));
const categories = Object.keys(data);
const sets: Record<string, Set<string>> = {};

console.log(`Analyzing PM Overlap across ${categories.length} categories...`);

// Build sets
categories.forEach(cat => {
    sets[cat] = new Set(data[cat].map((m: any) => m.id));
    console.log(`- ${cat}: ${sets[cat].size} items`);
});

// Check overlaps
let totalOverlaps = 0;
let totalPairs = 0;

console.log("\nOverlap Report:");
for (let i = 0; i < categories.length; i++) {
    for (let j = i + 1; j < categories.length; j++) {
        const catA = categories[i];
        const catB = categories[j];
        const setA = sets[catA];
        const setB = sets[catB];
        
        const intersection = new Set([...setA].filter(x => setB.has(x)));
        if (intersection.size > 0) {
            console.log(`[WARN] ${catA} <-> ${catB}: ${intersection.size} overlaps`);
            // Show sample
            const sample = [...intersection].slice(0, 3);
            console.log(`       Sample: ${sample.join(', ')}`);
            totalOverlaps += intersection.size;
        }
        totalPairs++;
    }
}

if (totalOverlaps === 0) {
    console.log("\n✅ SUCCESS: No cross-category pollution detected.");
} else {
    console.log(`\n⚠️ WARNING: Detected ${totalOverlaps} overlaps.`);
}
