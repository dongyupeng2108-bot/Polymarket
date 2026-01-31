const fs = require('fs');
const path = 'E:\\polymaket\\Github\\traeback\\scripts\\test_write.txt';
try {
    fs.writeFileSync(path, 'test');
    console.log('Write success');
} catch (e) {
    console.error('Write failed:', e.message);
}
