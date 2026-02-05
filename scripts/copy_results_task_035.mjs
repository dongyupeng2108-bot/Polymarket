
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcDir = path.join(__dirname, '../temp_results/M1_5_PairsMgmt_AutoMatch_Task035_Diag_ZeroScan_Reconnect_AllUnverified_260126_035');
const destDir = 'e:\\polymaket\\Github\\traeback\\results\\M1_5_PairsMgmt_AutoMatch_Task035_Diag_ZeroScan_Reconnect_AllUnverified_260126_035';

console.log(`Copying from ${srcDir} to ${destDir}`);

try {
    if (!fs.existsSync(destDir)) {
        console.log('Creating destination directory...');
        fs.mkdirSync(destDir, { recursive: true });
    }

    const files = fs.readdirSync(srcDir);
    files.forEach(file => {
        const src = path.join(srcDir, file);
        const dest = path.join(destDir, file);
        fs.copyFileSync(src, dest);
        console.log(`Copied ${file}`);
    });
    console.log('Copy complete.');
} catch (err) {
    console.error('Copy failed:', err);
    process.exit(1);
}
