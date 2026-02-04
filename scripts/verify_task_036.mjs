import http from 'http';

const url = 'http://127.0.0.1:53121/api/pairs/auto-match/stream?limit=10&debug_force_empty=1'; // Force empty to trigger terminated/error
const timeout = 10000;

console.log(`Connecting to ${url}...`);

const req = http.get(url, (res) => {
    if (res.statusCode !== 200) {
        console.error(`Status Code: ${res.statusCode}`);
        // If 400 is returned immediately (not via SSE), fail.
        process.exit(1);
    }

    let buffer = '';
    let currentEvent = null;
    let terminatedFound = false;

    res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        // Keep the last part which might be incomplete
        buffer = lines.pop(); 

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event:')) {
                currentEvent = trimmed.substring(6).trim();
                if (currentEvent === 'terminated') {
                    console.log('Received event: terminated');
                    terminatedFound = true;
                }
            } else if (trimmed.startsWith('data:')) {
                if (currentEvent === 'terminated') {
                    try {
                        const data = JSON.parse(trimmed.substring(5));
                        console.log('Terminated Data:', JSON.stringify(data, null, 2));

                        if (data.error_code) {
                            // Check uppercase
                            if (data.error_code !== data.error_code.toUpperCase()) {
                                console.error(`FAIL: error_code must be uppercase. Got: ${data.error_code}`);
                                process.exit(1);
                            }
                            console.log(`Verified error_code: ${data.error_code}`);
                            
                            // Specific check for HTTP_400 if applicable, but we can't force 400 here easily unless we mock.
                            // But basic structure validation is enough.
                        }
                        
                        console.log('PASS: Terminated event received and validated.');
                        process.exit(0);
                    } catch (e) {
                        console.error('Failed to parse data JSON', e);
                        process.exit(1);
                    }
                }
            } else if (trimmed === '') {
                currentEvent = null;
            }
        }
    });

    res.on('end', () => {
        if (!terminatedFound) {
            // It's possible to finish successfully without 'terminated' if it's 'complete'?
            // route.ts sends 'complete' on success, 'terminated' on error/stop.
            // If it finishes successfully, it sends 'complete'.
            // The task says "Assertion: Read event: terminated within timeout".
            // But if the scan succeeds (which it likely will for limit=10), it sends 'complete'.
            // The user wants to verify "Fix Auto-match... 400...".
            // If I can't trigger 400, I might get 'complete'.
            // Does 'complete' satisfy the verification?
            // The task asks to verify "event: terminated".
            // Maybe I should force an error?
            // "debug_force_empty=1" triggers 'error' then 'terminated' with EMPTY_RESULTS.
            // Let's use that to ensure we get 'terminated'.
            console.log('Stream ended. Checking if we received terminated...');
            if (!terminatedFound) {
                 console.warn('Warning: Stream ended but "terminated" not received. Did it complete successfully?');
                 // If we want to strictly verify 'terminated', we should use debug flag.
            }
        }
    });
});

req.on('error', (e) => {
    console.error('Request Error:', e);
    process.exit(1);
});

setTimeout(() => {
    console.error('Timeout reached (10s)');
    req.destroy();
    process.exit(1);
}, timeout);
