const fs = require('fs');
const path = require('path');

const dirs = [
    'E:\\polymaket\\Github\\traeback\\results\\M0_Flow_v3_4_FixHandoverMarkersAndZipOptional_260124_031_Retry',
    'E:\\polymaket\\Github\\traeback\\results\\M0_Flow_v3_4_FixFinalizer_TaskDir_Markers_ZipMeta_260125_001'
];

dirs.forEach(dir => {
    if (fs.existsSync(dir)) {
        console.log(`Deleting: ${dir}`);
        try {
            fs.rmSync(dir, { recursive: true, force: true });
            console.log(`Deleted: ${dir}`);
        } catch (e) {
            console.error(`Failed to delete ${dir}:`, e);
        }
    } else {
        console.log(`Not found (already clean): ${dir}`);
    }
});
