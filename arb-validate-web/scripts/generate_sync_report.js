
const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function generateReport() {
    const reportFile = path.join(__dirname, '../docs/trae_sync.md');
    const timestamp = new Date().toISOString();
    
    // Default task description if not provided via args
    const taskDescription = process.argv[2] || "Impl: Kalshi Ping, Proxy UI Fix, Detailed Error Logging, Pair URL Gen";

    let proxyData = null;
    let orderbookData = null;
    let khPingData = null;

    // 1. Fetch Proxy Ping
    try {
        const res = await axios.get('http://localhost:3000/api/debug/proxy/ping');
        proxyData = res.data;
    } catch (e) {
        proxyData = { error: e.message, hint: "Is server running on port 3000?" };
    }

    // 2. Fetch Orderbook
    try {
        const res = await axios.get('http://localhost:3000/api/debug/kh/orderbook?ticker=kxgdp-26jan30');
        orderbookData = res.data;
    } catch (e) {
        orderbookData = { error: e.message };
    }

    // 3. Fetch KH Ping
    try {
        const res = await axios.get('http://localhost:3000/api/debug/kh/ping');
        khPingData = res.data;
    } catch (e) {
        khPingData = { error: e.message };
    }

    const content = `
# Trae <> ChatGPT Sync Channel

## Update: ${timestamp}

### Task
${taskDescription}

### Changes Summary
- Implemented \`/api/debug/kh/ping\` with detailed diagnostics (DNS, TCP, TLS, HTTP, Auth).
- Updated Settings UI to show real Kalshi Health (Ping status, Latency, Reason).
- Fixed Proxy UI to show "None (all failed)" when no active proxy is valid.
- Added detailed error codes and stage tracking to connectivity checks.

### Evidence Package

#### 1. Kalshi Connectivity (/api/debug/kh/ping)
\`\`\`json
${JSON.stringify(khPingData, null, 2)}
\`\`\`

#### 2. Proxy Health (/api/debug/proxy/ping)
\`\`\`json
${JSON.stringify(proxyData, null, 2)}
\`\`\`

#### 3. Orderbook Test (/api/debug/kh/orderbook?ticker=kxgdp-26jan30)
\`\`\`json
${JSON.stringify(orderbookData, null, 2)}
\`\`\`
`;
    
    fs.writeFileSync(reportFile, content);
    console.log(`Report generated at ${reportFile}`);
}

generateReport();
