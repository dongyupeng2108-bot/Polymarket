
const fs = require('fs');
const path = 'E:\\polymaket\\Github\\traeback\\scripts\\test_access.txt';
try {
    fs.writeFileSync(path, 'test');
    console.log('Success writing to ' + path);
    fs.unlinkSync(path); // Clean up
} catch (e) {
    console.error('Failed: ' + e.message);
}
