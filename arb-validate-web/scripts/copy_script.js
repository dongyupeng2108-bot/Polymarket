const fs = require('fs');
const path = require('path');

const src = "E:\\polymaket\\program\\arb-validate-web\\scripts\\finalize_task.mjs";
const destDir = "E:\\polymaket\\Github\\traeback\\scripts";
const dest = path.join(destDir, "finalize_task.mjs");

if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
}

fs.copyFileSync(src, dest);
console.log(`Copied ${src} to ${dest}`);
