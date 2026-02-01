const fs = require('fs');
const path = require('path');

const src = 'E:\\polymaket\\Github\\traeback\\failed\\task_id_ M0_Flow_v3_4_RemoveZip_FromPipeline_260125_003_260125_007.md';
const dest = 'E:\\polymaket\\Github\\ChatGPT task\\M0_Flow_v3_4_RemoveZip_FromPipeline_260125_003.md';

try {
  if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log('Copied successfully to ' + dest);
      // fs.unlinkSync(src); // Leave original in failed for now
  } else {
      console.error('Source file not found: ' + src);
  }
} catch (err) {
  console.error('Error:', err);
}
