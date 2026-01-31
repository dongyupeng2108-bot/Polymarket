
import axios from 'axios';
import { getAgent } from '../src/lib/utils/proxy-agent';

async function main() {
    const targetUrl = 'https://api.elections.kalshi.com/trade-api/v2/exchange/status';
    const start = Date.now();
    
    // Use "Direct" profile to force env var usage in getAgent
    // Or pass undefined if getAgent handles it (it does, optional profile)
    const agent = getAgent(undefined, targetUrl);
    
    const isProxy = agent.httpsAgent && agent.httpsAgent.constructor.name !== 'Agent';
    
    let result = {
        timestamp: new Date().toISOString(),
        url: targetUrl,
        proxy_used: isProxy,
        proxy_agent_name: agent.httpsAgent?.constructor.name || 'Unknown',
        env_proxy: process.env.HTTPS_PROXY || process.env.HTTP_PROXY,
        http_status: null as number | null,
        elapsed_ms: 0,
        error: null as string | null
    };

    try {
        const axiosInstance = axios.create({
            timeout: 5000,
            ...agent,
            validateStatus: () => true
        });

        const res = await axiosInstance.get(targetUrl);
        result.elapsed_ms = Date.now() - start;
        result.http_status = res.status;
        
        console.log(JSON.stringify(result, null, 2));
        
        // Success if 200 or 401 (reachable)
        if (res.status === 200 || res.status === 401) {
            process.exit(0);
        } else {
            process.exit(1);
        }
    } catch (e: any) {
        result.elapsed_ms = Date.now() - start;
        result.error = e.message;
        console.log(JSON.stringify(result, null, 2));
        process.exit(1);
    }
}

main();
