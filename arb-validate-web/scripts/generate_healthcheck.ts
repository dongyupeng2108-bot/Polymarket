
import fs from 'fs';
// import fetch from 'node-fetch';

async function run() {
    const baseUrl = 'http://localhost:53121';
    const endpoints = ['/', '/api/pairs']; // /pairs might be POST only, checking root and others
    const reportPath = 'reports/healthcheck_53121.txt';

    let output = `Healthcheck Report - ${new Date().toISOString()}\n`;
    output += `Target: ${baseUrl}\n\n`;

    try {
        // Check Root
        const resRoot = await fetch(baseUrl + '/');
        output += `GET / -> ${resRoot.status} ${resRoot.statusText}\n`;
        
        // Check Pairs Page (UI)
        const resPairs = await fetch(baseUrl + '/pairs');
        output += `GET /pairs -> ${resPairs.status} ${resPairs.statusText}\n`;
        
        // Also check API pairs just in case, but don't fail hard if it's not 200, just log it
        try {
            const resApiPairs = await fetch(baseUrl + '/api/pairs', { 
                method: 'GET'
            });
            output += `GET /api/pairs -> ${resApiPairs.status} ${resApiPairs.statusText} (API)\n`;
        } catch (e) {
            output += `GET /api/pairs -> Error: ${e.message}\n`;
        }

    } catch (e: any) {
        output += `ERROR: ${e.message}\n`;
    }

    fs.writeFileSync(reportPath, output);
    console.log(`Written to ${reportPath}`);
}

run();
