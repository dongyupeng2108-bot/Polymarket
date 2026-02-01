import http from 'http';

const LIMIT = 10;
const URL = `http://localhost:53121/api/pairs/auto-match/stream?limit=${LIMIT}`;

console.log(`Testing SSE Endpoint: ${URL}`);

const req = http.get(URL, (res) => {
    console.log(`Response Status: ${res.statusCode}`);
    
    if (res.statusCode !== 200) {
        console.error('Failed to connect');
        process.exit(1);
    }

    res.setEncoding('utf8');

    let buffer = '';
    let eventCount = 0;
    let hasDone = false;
    let hasProgress = false;
    let hasError = false;

    res.on('data', (chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n\n');
        buffer = lines.pop(); // Keep incomplete chunk

        for (const line of lines) {
            if (!line.trim()) continue;
            
            const eventMatch = line.match(/event: (.*)\n/);
            const dataMatch = line.match(/data: (.*)/);
            
            if (eventMatch && dataMatch) {
                const event = eventMatch[1].trim();
                const dataStr = dataMatch[1].trim();
                eventCount++;
                
                try {
                    const data = JSON.parse(dataStr);
                    console.log(`[${event}]`, JSON.stringify(data).substring(0, 100) + '...');
                    
                    if (event === 'progress') {
                        hasProgress = true;
                        if (typeof data.scanned !== 'number') console.error('Missing scanned in progress');
                    }
                    if (event === 'done') {
                        hasDone = true;
                        console.log('Done event received with summary:', data.summary);
                        if (!data.summary) console.error('Missing summary in done');
                    }
                    if (event === 'error') {
                        hasError = true;
                        console.log('Error event received (Validating SSE error channel).');
                    }
                } catch (e) {
                    console.error('Failed to parse JSON:', dataStr);
                }
            }
        }
    });

    res.on('end', () => {
        console.log('Stream ended.');
        if (hasProgress && (hasDone || hasError)) {
            console.log('TEST PASSED: Received progress and completion/error events.');
            process.exit(0);
        } else {
            console.error('TEST FAILED: Missing events. Progress:', hasProgress, 'Done:', hasDone, 'Error:', hasError);
            process.exit(1);
        }
    });
});

req.on('error', (e) => {
    console.error('Request Error:', e.message);
    process.exit(1);
});

// Timeout
setTimeout(() => {
    console.error('TEST TIMEOUT');
    req.destroy();
    process.exit(1);
}, 30000);
