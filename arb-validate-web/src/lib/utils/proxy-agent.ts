
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { ProxyProfile } from '../config/proxies';
import http from 'http';
import https from 'https';

export function getAgent(profile?: ProxyProfile, targetUrl?: string) {
    // 1. Determine Proxy URL
    let proxyUrl: string | null = null;

    // A. Explicit Profile (High Priority)
    if (profile && profile.type !== 'direct' && profile.url) {
        proxyUrl = profile.url;
    } 
    // B. Environment Variables (Fallback if Direct/None)
    else {
        // Check NO_PROXY first
        if (targetUrl && isNoProxy(targetUrl)) {
            proxyUrl = null;
        } else {
            // Check HTTPS_PROXY for https targets, HTTP_PROXY for others
            const isHttps = targetUrl ? targetUrl.startsWith('https') : true; // Default to https check if unknown
            if (isHttps) {
                proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || null;
            } else {
                proxyUrl = process.env.HTTP_PROXY || process.env.http_proxy || null;
            }
        }
    }

    // 2. Return Agent
    if (!proxyUrl) {
        return {
            httpAgent: new http.Agent({ keepAlive: true }),
            httpsAgent: new https.Agent({ keepAlive: true }),
            proxy: false as const // Explicitly disable axios proxy
        };
    }

    if (proxyUrl.startsWith('socks')) {
        const agent = new SocksProxyAgent(proxyUrl);
        return {
            httpAgent: agent,
            httpsAgent: agent,
            proxy: false as const
        };
    }

    // HTTP/HTTPS Proxy
    // If target is HTTPS, use HttpsProxyAgent (CONNECT)
    // If target is HTTP, use HttpProxyAgent
    // If target is unknown (no targetUrl), assume HTTPS (common case for us) or provide both?
    // Note: HttpsProxyAgent can handle http->https. HttpProxyAgent handles http->http.
    
    // We create separate agents for safety if possible, or one if generic.
    // But commonly one agent instance can be reused if compatible.
    // HttpsProxyAgent is specifically for "https endpoint over http proxy".
    // HttpProxyAgent is for "http endpoint over http proxy".
    
    return {
        httpAgent: new HttpProxyAgent(proxyUrl),
        httpsAgent: new HttpsProxyAgent(proxyUrl),
        proxy: false as const
    };
}

function isNoProxy(targetUrl: string): boolean {
    const noProxy = process.env.NO_PROXY || process.env.no_proxy;
    if (!noProxy) return false;

    try {
        const url = new URL(targetUrl);
        const hostname = url.hostname;
        
        // Comma separated
        const domains = noProxy.split(',').map(s => s.trim()).filter(s => s);
        
        for (const domain of domains) {
            if (domain === '*') return true;
            if (hostname === domain) return true;
            if (domain.startsWith('.') && hostname.endsWith(domain)) return true;
            if (hostname.endsWith(`.${domain}`)) return true; // loose match
        }
    } catch (e) {
        // ignore invalid url
    }
    return false;
}
