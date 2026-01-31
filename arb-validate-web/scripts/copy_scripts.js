
const fs = require('fs');
const path = require('path');

const srcDir = 'E:\\polymaket\\program\\arb-validate-web\\scripts';
const destDir = 'E:\\polymaket\\Github\\traeback\\scripts';

const files = ['finalize_task_v3.4.mjs', 'smart_agent_handover.mjs'];

files.forEach(f => {
    try {
        const src = path.join(srcDir, f);
        const dest = path.join(destDir, f);
        console.log(`Copying ${src} to ${dest}...`);
        fs.copyFileSync(src, dest);
        console.log(`Success: ${f}`);
    } catch (e) {
        console.error(`Failed to copy ${f}: ${e.message}`);
    }
});
