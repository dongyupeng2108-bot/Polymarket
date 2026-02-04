
import fs from 'fs';
import path from 'path';

const ROOT_TRAEBACK = 'E:\\polymaket\\Github\\traeback';
const filesToDelete = [
    'result_M0_Flow_v3_4_FixHandoverMarkersAndZipOptional_260124_031.json',
    'notify_M0_Flow_v3_4_FixHandoverMarkersAndZipOptional_260124_031.txt',
    'deliverables_index_M0_Flow_v3_4_FixHandoverMarkersAndZipOptional_260124_031.json',
    'readme.txt', // User might have created this? No, it was in LS.
    'evidence.log' // Maybe keep this?
];

console.log('Cleaning traeback root...');
filesToDelete.forEach(f => {
    const p = path.join(ROOT_TRAEBACK, f);
    if (fs.existsSync(p)) {
        try {
            fs.unlinkSync(p);
            console.log(`Deleted: ${f}`);
        } catch (e) {
            console.error(`Failed to delete ${f}: ${e.message}`);
        }
    } else {
        console.log(`Not found: ${f}`);
    }
});
