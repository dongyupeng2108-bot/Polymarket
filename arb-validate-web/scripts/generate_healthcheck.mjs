
import fs from 'fs';
import { fetch } from 'undici';

async function check(url) {
    try {
        const res = await fetch(url);
        return `${url.replace('http://localhost:53121', '')} -> ${res.status}`;
    } catch (e) {
        return `${url.replace('http://localhost:53121', '')} -> ERROR: ${e.message}`;
    }
}

async function main() {
    const root = await check('http://localhost:53121/');
    const pairs = await check('http://localhost:53121/api/pairs');
    
    const content = `Healthcheck Report
Timestamp: ${new Date().toISOString()}

${root}
${pairs}

System: Windows
Port: 53121
`;
    fs.writeFileSync('healthcheck_53121.txt', content);
    console.log('Generated healthcheck_53121.txt');
}

main();
