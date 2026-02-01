
import http from 'http';
import fs from 'fs';

const PORT = 53121;
const ENDPOINTS = ['/', '/pairs'];
const TIMEOUT = 5000;

async function checkEndpoint(path) {
    return new Promise((resolve) => {
        const options = {
            hostname: '127.0.0.1',
            port: PORT,
            path: path,
            method: 'GET',
            timeout: TIMEOUT
        };

        const req = http.request(options, (res) => {
            resolve({
                path: path,
                status: res.statusCode,
                ok: res.statusCode === 200
            });
        });

        req.on('error', (e) => {
            resolve({
                path: path,
                status: 0,
                error: e.message,
                ok: false
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({
                path: path,
                status: 0,
                error: 'Timeout',
                ok: false
            });
        });

        req.end();
    });
}

async function run() {
    const results = {};
    let allOk = true;

    console.log(`Checking health on port ${PORT}...`);

    for (const endpoint of ENDPOINTS) {
        const res = await checkEndpoint(endpoint);
        results[endpoint] = res.status;
        if (!res.ok) allOk = false;
        console.log(`Endpoint ${endpoint}: ${res.status} ${res.ok ? 'OK' : 'FAIL'}`);
    }

    const output = {
        timestamp: new Date().toISOString(),
        port: PORT,
        endpoints: results,
        status: allOk ? 'PASSED' : 'FAILED'
    };

    fs.writeFileSync('healthcheck_result.json', JSON.stringify(output, null, 2));
    console.log('Saved to healthcheck_result.json');
}

run();
