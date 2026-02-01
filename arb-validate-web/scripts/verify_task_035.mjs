
import { fetch } from 'undici'; // Next.js uses undici, or global fetch in Node 18+
import fs from 'fs';

// If global fetch is not available (older node), use node-fetch or similar?
// The environment seems to be Node 20+ based on previous context.
// But to be safe, I'll use global.fetch if available.

const BASE_URL = 'http://localhost:53121';

async function verify() {
    console.log('Starting verification for Task 035...');
    
    // Test Case: Force Empty Results
    // This triggers the path where 0 scanned + terminated happens.
    const url = `${BASE_URL}/api/pairs/auto-match/stream?limit=10&debug_force_empty=1`;
    
    console.log(`Connecting to ${url}...`);
    
    try {
        const res = await fetch(url);
        
        if (!res.ok) {
            console.error(`Failed to connect: ${res.status} ${res.statusText}`);
            process.exit(1);
        }
        
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        
        let receivedTerminated = false;
        let receivedError = false;
        let buffer = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;
            
            // simple check for events
            if (buffer.includes('event: error')) {
                receivedError = true;
                console.log('Received "error" event.');
            }
            if (buffer.includes('event: terminated')) {
                receivedTerminated = true;
                console.log('Received "terminated" event.');
            }
        }
        
        if (receivedError && receivedTerminated) {
            console.log('SUCCESS: Received both error and terminated events.');
            console.log('This confirms the fix for "repeated reconnection" loop.');
        } else {
            console.error('FAILED: Did not receive expected events.');
            console.error(`Error: ${receivedError}, Terminated: ${receivedTerminated}`);
            process.exit(1);
        }

    } catch (e) {
        console.error('Verification Error:', e);
        process.exit(1);
    }
}

verify();
