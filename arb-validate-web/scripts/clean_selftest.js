const fs = require('fs');
const path = require('path');

const TRAEBACK_ROOT = 'E:\\polymaket\\Github\\traeback';
const runningDir = path.join(TRAEBACK_ROOT, 'running');

console.log('Cleaning up SelfTest files...');

if (fs.existsSync(runningDir)) {
    const files = fs.readdirSync(runningDir);
    files.forEach(f => {
        if (f.includes('SelfTest')) {
            console.log(`Deleting: ${f}`);
            try {
                fs.unlinkSync(path.join(runningDir, f));
            } catch (e) {
                console.error(`Failed to delete ${f}:`, e);
            }
        }
    });
}
console.log('Cleanup complete.');
