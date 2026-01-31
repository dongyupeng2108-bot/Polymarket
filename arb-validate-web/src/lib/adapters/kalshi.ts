
import axios from 'axios';
import { MarketOrderBook, FetchDebugResult } from '../types';
import { checkDns, checkTcp, getProxyStatus } from '../utils/diagnostics';
import { ProxySelector } from '../services/proxy-selector';
import { getAgent } from '../utils/proxy-agent';

const BASE_URL = process.env.KALSHI_API_URL || 'https://api.elections.kalshi.com/trade-api/v2';

function getEnvFingerprint() {
    const key = process.env.KALSHI_KEY_ID;
    if (!key) return 'MISSING';
    if (key.length < 4) return 'SHORT';
    return key.substring(0, 4) + '****';
}

function getEnvStatus() {
    const keyId = process.env.KALSHI_KEY_ID;
    const privateKey = process.env.KALSHI_PRIVATE_KEY;
    const missing: string[] = [];
    if (!keyId) missing.push('KALSHI_KEY_ID');
    if (!privateKey) missing.push('KALSHI_PRIVATE_KEY');
    
    return {
        ok: missing.length === 0,
        missing,
        has_key_id: !!keyId,
        has_private_key: !!privateKey
    };
}

interface KalshiResponse {
  orderbook: {
    bids: [number, number][]; // [price, size]
    asks: [number, number][];
  };
}

function classifyError(error: any): string {
    const code = error.code;
    const msg = error.message || '';
    
    if (code === 'ECONNREFUSED') return 'proxy_refused'; // Special requirement
    if (code === 'ETIMEDOUT' || msg.includes('timeout')) return 'timeout';
    if (code === 'ENOTFOUND') return 'dns';
    if (code === 'ECONNRESET') return 'tcp';
    if (code?.includes('CERT') || msg.includes('SSL')) return 'tls';
    if (error.response) {
        if (error.response.status === 401) return 'http_401';
        if (error.response.status === 403) return 'http_403';
        if (error.response.status === 429) return 'http_429';
        return 'http';
    }
    if (error instanceof SyntaxError) return 'parse';
    return 'unknown';
}

// Single Entry Point for Kalshi Requests
export async function khRequest(endpoint: string, options: any = {}): Promise<any> {
    // 1. Pre-flight Env Check (Task 038)
    const envStatus = getEnvStatus();
    
    // Task 040: Public Read-Only Mode Support
    // If credentials missing but endpoint is public markets/series, allow bypass.
    const isPublicMarkets = endpoint === '/markets' || endpoint.startsWith('/markets?') || 
                           endpoint === '/series' || endpoint.startsWith('/series?') ||
                           endpoint === '/events' || endpoint.startsWith('/events?');
    const isPublicReadOnly = !envStatus.ok && isPublicMarkets;

    if (!envStatus.ok && !isPublicReadOnly) {
        return {
            success: false,
            meta: {
                http_status: 400, // Keep as 400 per Rules
                latency_ms: 0,
                proxy_profile: 'none',
                proxy_used: false,
                attempt: 0,
                attempts: [],
                url_used: `${BASE_URL}${endpoint}`,
                error_class: 'config',
                error_code: 'HTTP_400',
                error_message: `Missing Kalshi credentials env vars: ${envStatus.missing.join(', ')}`,
                env_status: envStatus
            }
        };
    }

    const selector = ProxySelector.getInstance();
    let attempt = 0;
    const maxAttempts = 2;
    let lastError: any = null;
    const attemptLogs: any[] = [];
    const triedProfiles = new Set<string>();

    while (attempt < maxAttempts) {
        attempt++;
        
        // Use selectBestProfile with exclusion list to avoid retrying failed/same profile
        const best = selector.selectBestProfile(triedProfiles);
        const profile = best.profile;
        
        // If we exhausted all options (including fallbacks) and still get same or no profile
        if (triedProfiles.has(profile.name)) {
            // Should not happen if selectBestProfile respects exclusion, unless it returns fallback
            // If fallback is already tried, we stop.
            break;
        }
        
        triedProfiles.add(profile.name);
        const agent = getAgent(profile);
        const url = `${BASE_URL}${endpoint}`;
        const start = Date.now();

        const attemptLog: any = {
            attempt,
            profile_name: profile.name,
            proxy_used: profile.type !== 'direct',
            proxy_value_masked: profile.url ? profile.url.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@') : null,
            env_fingerprint: getEnvFingerprint(),
            latency_ms: 0,
            http_status: null,
            error_class: null,
            error_code: null,
            error_message: null
        };

        try {
            const axiosInstance = axios.create({
                ...agent,
                timeout: profile.request_timeout_ms,
                validateStatus: () => true
            });

            const res = await axiosInstance.get(url, options);
            const latency = Date.now() - start;
            attemptLog.latency_ms = latency;
            attemptLog.http_status = res.status;

            if (res.status === 200) {
                return {
                    success: true,
                    data: res.data,
                    meta: {
                        http_status: 200,
                        latency_ms: latency,
                        proxy_profile: profile.name,
                        proxy_used: profile.type !== 'direct',
                        attempt,
                        attempts: [...attemptLogs, attemptLog],
                        url_used: url,
                        // Diagnostics
                        request_meta: {
                            base_url: BASE_URL,
                            path: endpoint,
                            query: options.params || {}, // Minimal query capture
                            env_present: {
                                key_id: envStatus.has_key_id,
                                private_key: envStatus.has_private_key
                            },
                            auth_method: 'unknown' // Placeholder until explicit auth added
                        }
                    }
                };
            } else {
                const isAuthError = res.status === 401 || res.status === 403;
                const isClientError = res.status === 400 || res.status === 404;
                
                attemptLog.error_class = 'http';
                attemptLog.error_code = `http_${res.status}`;
                attemptLog.error_message = res.statusText;

                // Capture upstream body preview
                let upstreamBodyPreview = null;
                if (res.data) {
                    try {
                        const bodyStr = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
                        upstreamBodyPreview = bodyStr.slice(0, 1200);
                    } catch (e) {
                        upstreamBodyPreview = '[Unserializable Body]';
                    }
                }

                if (!isAuthError && !isClientError) {
                     selector.reportFailure(profile.name, `http_${res.status}`);
                }

                if (isAuthError || isClientError) {
                    // Task 037: Safe Diagnostics Logging
                    console.error(`[Kalshi] Fetch Failed: ${url} (Status: ${res.status})`);
                    console.error(`[Kalshi] Fingerprint: ${getEnvFingerprint()}`);
                    console.error(`[Kalshi] Body: ${upstreamBodyPreview ? upstreamBodyPreview.slice(0, 500) : 'null'}`);

                    // Task 039: Enhanced Diagnostics & Normalization
                    const is400 = res.status === 400;
                    const errorCode = is400 ? 'HTTP_400' : `http_${res.status}`;
                    
                    let diagClass = 'http_error';
                    if (res.status === 400) diagClass = 'bad_request'; // 参数错
                    else if (res.status === 401 || res.status === 403) diagClass = 'auth_error'; // 鉴权错
                    else if (res.status === 404) diagClass = 'not_found';
                    else if (res.status === 429) diagClass = 'rate_limit';

                    attemptLogs.push(attemptLog);
                    return {
                        success: false,
                        meta: {
                            http_status: res.status,
                            latency_ms: latency,
                            proxy_profile: profile.name,
                            proxy_used: profile.type !== 'direct',
                            attempt,
                            attempts: attemptLogs,
                            url_used: url,
                            error_class: 'http',
                            error_code: errorCode, // Normalized
                            error_message: res.statusText,
                            raw_body: res.data,
                            // Task 038/039 Diagnostics
                            diagnostic_classification: diagClass,
                            upstream_body_preview: upstreamBodyPreview,
                            request_meta: {
                                base_url: BASE_URL,
                                path: endpoint,
                                query: options.params || {},
                                env_present: {
                                    key_id: envStatus.has_key_id,
                                    private_key: envStatus.has_private_key
                                },
                                auth_method: 'unknown'
                            }
                        }
                    };
                }

                lastError = {
                    message: `HTTP ${res.status}`,
                    code: `http_${res.status}`,
                    class: 'http',
                    response: res
                };
            }

        } catch (error: any) {
            const latency = Date.now() - start;
            attemptLog.latency_ms = latency;
            const errorClass = classifyError(error);
            const errorCode = error.code || error.message;

            attemptLog.error_class = errorClass === 'proxy_refused' ? 'tcp' : errorClass; // Map back to standard for response
            // But we keep internal class for fail reporting
            
            attemptLog.error_code = errorCode;
            attemptLog.error_message = error.message;
            
            // Report to selector
            selector.reportFailure(profile.name, errorClass);
            
            lastError = error;
            lastError.class = errorClass;
        }
        attemptLogs.push(attemptLog);
    }

    return {
        success: false,
        meta: {
            http_status: 0,
            latency_ms: 0,
            proxy_profile: 'exhausted',
            proxy_used: false,
            attempt: attemptLogs.length,
            attempts: attemptLogs,
            url_used: `${BASE_URL}${endpoint}`,
            error_class: lastError?.class === 'proxy_refused' ? 'tcp' : (lastError?.class || 'unknown'),
            error_code: lastError?.code || lastError?.message,
            error_message: lastError?.message
        }
    };
}

export async function fetchKalshiBookDebug(ticker: string): Promise<FetchDebugResult> {
    const res = await khRequest(`/markets/${ticker}/orderbook`);
    
    if (!res.success) {
        return {
            http_status: res.meta.http_status,
            latency_ms: res.meta.latency_ms || 0,
            bids_len: 0,
            asks_len: 0,
            error_code: res.meta.error_code,
            error_class: res.meta.error_class,
            error_message: res.meta.error_message,
            raw_body: res.meta.raw_body,
            parsed_book: { bids: [], asks: [] },
            url_used: res.meta.url_used,
            proxy_used: res.meta.proxy_used,
            proxy_value: res.meta.proxy_profile,
            attempts: res.meta.attempts,
            final: {
                ok: false,
                http_status: res.meta.http_status,
                error_class: res.meta.error_class,
                error_code: res.meta.error_code,
                error_message: res.meta.error_message
            }
        } as any;
    }

    const data = res.data;
    
    // Robust null check for orderbook structure
    // Handling both standard 'bids/asks' and potential 'yes/no' variants
    const ob = data.orderbook || {};
    
    // User Requirement: 
    // orderbook.yes -> YES Bids (keep as is)
    // orderbook.no  -> NO Bids -> Transform to YES Asks (100 - no_bid)
    
    // If 'yes' is present, use it. If not, fallback to 'bids' (assuming already YES bids)
    const rawYesBids = Array.isArray(ob.yes) ? ob.yes : (Array.isArray(ob.bids) ? ob.bids : []);
    
    // If 'no' is present, use it for transformation. If not, fallback to 'asks' (assuming already YES asks)
    const rawNoBids = Array.isArray(ob.no) ? ob.no : null;
    const rawAsksFallback = Array.isArray(ob.asks) ? ob.asks : [];

    const normalizeBid = (levels: any[]) => 
      levels.map((level) => {
          if (Array.isArray(level)) {
              return {
                  price: (level[0] || 0) / 100,
                  size: level[1] || 0
              };
          }
          return { price: 0, size: 0 };
      });

    const normalizeAskFromNoBid = (levels: any[]) => 
      levels.map((level) => {
          if (Array.isArray(level)) {
              // yesAsk = 100 - noBid
              const noBidPrice = level[0] || 0;
              const yesAskPrice = 100 - noBidPrice;
              return {
                  price: yesAskPrice / 100,
                  size: level[1] || 0
              };
          }
          return { price: 0, size: 0 };
      });

    let bids = normalizeBid(rawYesBids);
    let asks: any[] = [];

    if (rawNoBids) {
        // Transform NO bids to YES asks
        asks = normalizeAskFromNoBid(rawNoBids);
    } else {
        // Use standard asks
        asks = normalizeBid(rawAsksFallback);
    }

    // Sort: Bids DESC, Asks ASC
    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);

    return {
        http_status: 200,
        latency_ms: res.meta.latency_ms,
        bids_len: bids.length,
        asks_len: asks.length,
        parsed_book: { bids, asks },
        url_used: res.meta.url_used,
        proxy_used: res.meta.proxy_used,
        proxy_value: res.meta.proxy_profile,
        attempts: res.meta.attempts,
        final: {
            ok: true,
            http_status: 200,
            error_class: null,
            error_code: null,
            error_message: null
        }
    } as any;
}

export async function getKalshiBook(ticker: string): Promise<MarketOrderBook> {
  const result = await fetchKalshiBookDebug(ticker);
  return result.parsed_book;
}

export async function checkKalshiConnectivity() {
    return { status: 'use_proxy_ping_endpoint_instead' };
}

export async function getMarketsByEvent(eventTicker: string) {
    return khRequest(`/markets?event_ticker=${eventTicker}&limit=200`);
}

export interface KalshiMarketDetails {
    ticker: string;
    title: string;
    status: string;
    expiration_time: string;
}

export async function getKalshiMarket(ticker: string): Promise<KalshiMarketDetails | null> {
    const res = await khRequest(`/markets/${ticker}`);
    
    if (!res.success) {
        if (res.meta.http_status === 404 || res.meta.http_status === 400) {
            console.warn(`[Kalshi] Market not found: ${ticker}`);
            return null;
        }
        throw new Error(`Kalshi Fetch Failed: ${res.meta.error_code}`);
    }

    const m = res.data.market;
    return {
        ticker: m.ticker,
        title: m.title,
        status: m.status,
        expiration_time: m.expiration_time
    };
}
