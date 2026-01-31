
const axios = require('axios');
const fs = require('fs');

async function verifyProxyFinal() {
    const reportFile = 'VERIFY_PROXY_FINAL_REPORT.json';
    const evidence = {
        timestamp: new Date().toISOString(),
        proxy_ping: null,
        kh_orderbook: null
    };

    console.log('--- Step 1: Health Check Profiles (JSON) ---');
    try {
        const res = await axios.get('http://localhost:53121/api/debug/proxy/ping');
        evidence.proxy_ping = res.data;
        console.log(JSON.stringify(res.data, null, 2));
    } catch(e) {
        console.error('Health Check Failed:', e.message);
        evidence.proxy_ping = { error: e.message };
    }

    console.log('\n--- Step 2: Auto-Switch Test (JSON) ---');
    try {
        const res = await axios.get('http://localhost:53121/api/debug/kh/orderbook?ticker=kxgdp-26jan30');
        evidence.kh_orderbook = res.data;
        console.log(JSON.stringify(res.data, null, 2));
    } catch(e) {
        console.error('Orderbook Request Failed:', e.message);
        evidence.kh_orderbook = { error: e.message };
    }

    fs.writeFileSync(reportFile, JSON.stringify(evidence, null, 2));
    console.log(`\nEvidence saved to ${reportFile}`);
}

verifyProxyFinal();
