
export type ProxyType = 'direct' | 'http' | 'https' | 'socks5';

export interface ProxyProfile {
  name: string;
  type: ProxyType;
  url: string | null; // null for direct
  enabled: boolean;
  weight: number;
  max_consecutive_fail: number;
  cooldown_ms: number;
  connect_timeout_ms: number;
  request_timeout_ms: number;
  per_host?: string[]; // e.g. ["api.elections.kalshi.com"]
}

const DEFAULT_PROFILES: ProxyProfile[] = [
  {
    name: 'Direct',
    type: 'direct',
    url: null,
    enabled: true,
    weight: 1,
    max_consecutive_fail: 3,
    cooldown_ms: 30000,
    connect_timeout_ms: 5000,
    request_timeout_ms: 8000
  },
  // Bad Proxy (Test) is disabled by default to prevent blocking real traffic
  // {
  //   name: 'Bad Proxy (Test)',
  //   type: 'http',
  //   url: 'http://127.0.0.1:9999', 
  //   enabled: false, 
  //   weight: 10, 
  //   max_consecutive_fail: 3,
  //   cooldown_ms: 30000,
  //   connect_timeout_ms: 2000,
  //   request_timeout_ms: 5000
  // }
];

export function getProxyProfiles(): ProxyProfile[] {
    console.log('[ProxyConfig] Loading profiles...');
    // 1. Load from ENV JSON if exists
    if (process.env.PROXY_PROFILES_JSON) {
        try {
            console.log('[ProxyConfig] Found PROXY_PROFILES_JSON');
            const parsed = JSON.parse(process.env.PROXY_PROFILES_JSON);
            if (Array.isArray(parsed)) return parsed;
        } catch (e) {
            console.error('Failed to parse PROXY_PROFILES_JSON', e);
        }
    }

    // 2. Load from individual env vars (Simple Override)
    const profiles = [...DEFAULT_PROFILES];
    console.log(`[ProxyConfig] Loaded defaults, count: ${profiles.length}`);
    
    if (process.env.HTTPS_PROXY || process.env.https_proxy) {
        const url = process.env.HTTPS_PROXY || process.env.https_proxy || '';
        console.log(`[ProxyConfig] Found HTTPS_PROXY: ${url}`);
        profiles.push({
            name: 'Env HTTPS_PROXY',
            type: 'http', 
            url: url,
            enabled: true,
            weight: 20, // Higher than Bad Proxy
            max_consecutive_fail: 3,
            cooldown_ms: 30000,
            connect_timeout_ms: 5000,
            request_timeout_ms: 8000
        });
    }

    if (process.env.HTTP_PROXY || process.env.http_proxy) {
        const url = process.env.HTTP_PROXY || process.env.http_proxy || '';
        if (!profiles.find(p => p.url === url)) {
            console.log(`[ProxyConfig] Found HTTP_PROXY: ${url}`);
            profiles.push({
                name: 'Env HTTP_PROXY',
                type: 'http',
                url: url,
                enabled: true,
                weight: 15,
                max_consecutive_fail: 3,
                cooldown_ms: 30000,
                connect_timeout_ms: 5000,
                request_timeout_ms: 8000
            });
        }
    }
    
    return profiles;
}
