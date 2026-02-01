
import { getPairs } from '../lib/services/pairs';

async function main() {
    try {
        console.log('Fetching pairs...');
        const rawPairs = await getPairs();
        console.log(`Fetched ${rawPairs.length} pairs.`);
        
        console.log('Stringifying...');
        const json = JSON.stringify(rawPairs);
        console.log('Stringified length:', json.length);
        
        const pairs = JSON.parse(json);
        console.log('Parsed successfully.');
        
        if (pairs.length > 0) {
            console.log('First pair sample:', pairs[0]);
            console.log('resolve_time_pm:', pairs[0].resolve_time_pm);
            console.log('resolve_time_kh:', pairs[0].resolve_time_kh);
        }
    } catch (e) {
        console.error('Error:', e);
    }
}

main();
