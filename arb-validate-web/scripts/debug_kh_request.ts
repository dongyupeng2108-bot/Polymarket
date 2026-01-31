
import { khRequest } from '../src/lib/adapters/kalshi';

async function run() {
    console.log('Testing khRequest with /events loop...');
    
    const targetCategories = ['Politics', 'Economics', 'Financials', 'Crypto', 'Science and Technology', 'Entertainment'];
    
    for (const cat of targetCategories) {
        console.log(`Fetching ${cat}...`);
        try {
            const res = await khRequest('/events', { 
                params: { 
                    limit: 300, 
                    status: 'open', 
                    category: cat 
                } 
            });
            
            console.log(`[${cat}] Success: ${res.success}`);
            if (res.success) {
                console.log(`[${cat}] Events: ${res.data.events?.length}`);
            } else {
                console.log(`[${cat}] Error: ${JSON.stringify(res.meta, null, 2)}`);
            }
        } catch (e) {
            console.error(`[${cat}] Exception:`, e);
        }
    }
}

run();
