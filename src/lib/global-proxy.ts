
import { setGlobalDispatcher, ProxyAgent, Agent, Dispatcher } from 'undici';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

// Global variable to track if proxy is setup
let isProxySetup = false;

export function shouldBypassProxy(urlStr: string): boolean {
    try {
        const url = new URL(urlStr);
        const hostname = url.hostname.toLowerCase();
        
        // 1. Force bypass for local addresses
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
            return true;
        }

        // 2. Check NO_PROXY environment variable
        const noProxy = process.env.NO_PROXY || process.env.no_proxy || '';
        if (!noProxy) return false;

        const noProxyList = noProxy.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        
        for (const pattern of noProxyList) {
            // Exact match
            if (hostname === pattern) return true;
            // Domain suffix match (e.g. .google.com matching api.google.com)
            if (pattern.startsWith('.') && hostname.endsWith(pattern)) return true;
            // Domain match without leading dot (e.g. google.com matching api.google.com - convention varies)
            if (hostname.endsWith(`.${pattern}`)) return true;
        }
        
        return false;
    } catch (e) {
        // If invalid URL, assume no bypass (or maybe true? safer to not proxy if unknown?)
        return false;
    }
}

export function setupGlobalProxy() {
    if (isProxySetup) return;

    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
    const noProxy = process.env.NO_PROXY || process.env.no_proxy || 'localhost,127.0.0.1';

    if (proxyUrl) {
        console.log(`[GlobalProxy] Found proxy configuration: ${proxyUrl}`);
        console.log(`[GlobalProxy] NO_PROXY: ${noProxy}`);

        // 1. Configure Undici (Node.js fetch)
        try {
            // Create a ProxyAgent for general use
            const proxyAgent = new ProxyAgent({
                uri: proxyUrl
            });

            // Create a Direct Agent for bypass
            const directAgent = new Agent();

            // Create an Interceptable Dispatcher or just a custom Dispatcher logic?
            // Since setGlobalDispatcher takes a Dispatcher, we can wrap it.
            // But undici doesn't have a simple "SwitchDispatcher".
            // However, ProxyAgent in newer undici might handle NO_PROXY if we don't force it?
            // Actually, best way for global patch is to rely on the user of fetch to pass agent if needed, 
            // OR use a customized dispatcher.
            
            // For now, we set the ProxyAgent as global.
            // Scripts MUST check shouldBypassProxy and pass { dispatcher: new Agent() } if needed.
            // We will log this requirement.
            
            setGlobalDispatcher(proxyAgent);
            console.log('[GlobalProxy] Undici (fetch) Global Dispatcher set to ProxyAgent.');
            console.log('[GlobalProxy] NOTE: Localhost requests must manually pass a direct dispatcher if not handled automatically.');
            
        } catch (e: any) {
            console.error(`[GlobalProxy] Failed to set Undici dispatcher: ${e.message}`);
        }

        isProxySetup = true;
    } else {
        console.log('[GlobalProxy] No proxy environment variables found (HTTP_PROXY, HTTPS_PROXY, ALL_PROXY).');
    }
}

// Helper to get the correct dispatcher for a URL
export function getFetchDispatcher(url: string): Dispatcher | undefined {
    if (shouldBypassProxy(url)) {
        return new Agent();
    }
    return undefined; // Use global (which is ProxyAgent if set)
}

export function getWebSocketAgent() {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
    
    if (!proxyUrl) return undefined;

    // Standard https-proxy-agent / socks-proxy-agent for 'ws' library
    if (proxyUrl.startsWith('socks')) {
        return new SocksProxyAgent(proxyUrl);
    } else {
        return new HttpsProxyAgent(proxyUrl);
    }
}
