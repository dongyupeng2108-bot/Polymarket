import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEST_DIR = 'E:\\polymaket\\Github\\traeback\\scripts';

const FILES = [
    {
        src: path.join(__dirname, 'temp_finalize_task_v3.4.mjs'),
        dest: 'finalize_task_v3.4.mjs'
    },
    {
        src: path.join(__dirname, 'temp_selftest_nozip.mjs'),
        dest: 'selftest_nozip_pipeline_v3.4.mjs'
    }
];

console.log(`[Deploy] CWD: ${process.cwd()}`);
console.log(`[Deploy] DEST: ${DEST_DIR}`);

if (!fs.existsSync(DEST_DIR)) {
    console.error(`Destination directory not found: ${DEST_DIR}`);
    process.exit(1);
}

FILES.forEach(file => {
    console.log(`[Deploy] Processing ${file.src} -> ${file.dest}`);
    if (fs.existsSync(file.src)) {
        try {
            const destPath = path.join(DEST_DIR, file.dest);
            fs.copyFileSync(file.src, destPath);
            console.log(`[Deploy] Success: ${file.dest}`);
        } catch (e) {
            console.error(`[Deploy] Failed to copy ${file.dest}: ${e.message}`);
        }
    } else {
        console.error(`[Deploy] Source file not found: ${file.src}`);
    }
});
