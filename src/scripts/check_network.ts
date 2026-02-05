
import { setupGlobalProxy, getWebSocketAgent } from '../lib/global-proxy';
import WebSocket from 'ws';

// 1. Setup Proxy immediately
setupGlobalProxy();

async function checkNetwork() {
    console.log('\n=== Network & Proxy Diagnostic ===');
    console.log(`Time: ${new Date().toISOString()}`);

    // Print Env Vars
    console.log('\n[1] Environment Variables');
    console.log(`    HTTP_PROXY:  ${process.env.HTTP_PROXY || '(not set)'}`);
    console.log(`    HTTPS_PROXY: ${process.env.HTTPS_PROXY || '(not set)'}`);
    console.log(`    ALL_PROXY:   ${process.env.ALL_PROXY || '(not set)'}`);
    console.log(`    NO_PROXY:    ${process.env.NO_PROXY || '(not set)'}`);

    // Fetch IP Check (uses Global Dispatcher)
    console.log('\n[2] Fetch Exit IP (via api.ipify.org)');
    try {
        // Since we set global dispatcher, native fetch should just work through proxy
        const res = await fetch('https://api.ipify.org');
        const ip = await res.text();
        console.log(`    Status: ${res.status} ${res.statusText}`);
        console.log(`    My Public IP: ${ip.trim()}`);
    } catch (e: any) {
        console.error(`    FAILED to fetch IP: ${e.message}`);
        if (e.cause) console.error(`    Cause:`, e.cause);
    }

    // WS Check
    console.log('\n[3] WebSocket Connection Test');
    const wsUrl = 'wss://ws-subscriptions-clob.polymarket.com/ws/market';
    console.log(`    Target: ${wsUrl}`);
    
    const agent = getWebSocketAgent();
    if (agent) {
        console.log(`    Using Agent: ${agent.constructor.name}`);
    } else {
        console.log(`    Using Direct Connection (No Proxy Agent)`);
    }

    await new Promise<void>((resolve) => {
        const ws = new WebSocket(wsUrl, {
            agent: agent,
            timeout: 10000
        });

        ws.on('open', () => {
            console.log('    [SUCCESS] WebSocket connection established (OPEN).');
            ws.close();
            resolve();
        });

        ws.on('error', (err) => {
            console.error(`    [FAILED] WebSocket Error: ${err.message}`);
            resolve();
        });

        ws.on('close', (code, reason) => {
             // If we closed it manually, it's fine. If it closed before open, error.
        });
    });

    console.log('\n=== Diagnostic Complete ===');
}

checkNetwork().catch(console.error);
