import axios from 'axios';
import { MarketOrderBook, FetchDebugResult } from '../types';
import { ProxySelector } from '../services/proxy-selector';
import { getAgent } from '../utils/proxy-agent';

const BASE_URL = process.env.POLYMARKET_API_URL || 'https://clob.polymarket.com';
const GAMMA_URL = 'https://gamma-api.polymarket.com';

// Error classification helper
function classifyError(error: any): string {
    const code = error.code;
    const msg = error.message || '';
    
    if (code === 'ECONNREFUSED') return 'proxy_refused';
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

// Single Entry Point for Polymarket Requests
export async function pmRequest(endpoint: string, options: any = {}, baseUrl: string = BASE_URL): Promise<any> {
    const selector = ProxySelector.getInstance();
    let attempt = 0;
    const maxAttempts = options.failFast ? 1 : 2;
    let lastError: any = null;
    const attemptLogs: any[] = [];
    const triedProfiles = new Set<string>();

    while (attempt < maxAttempts) {
        attempt++;
        
        const best = selector.selectBestProfile(triedProfiles);
        const profile = best.profile;
        
        if (triedProfiles.has(profile.name)) {
            break;
        }
        
        triedProfiles.add(profile.name);
        const agent = getAgent(profile);
        const url = `${baseUrl}${endpoint}`;
        const start = Date.now();

        const attemptLog: any = {
            attempt,
            profile_name: profile.name,
            proxy_used: profile.type !== 'direct',
            proxy_value_masked: profile.url ? profile.url.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@') : null,
            latency_ms: 0,
            http_status: null,
            error_class: null,
            error_code: null,
            error_message: null
        };

        try {
            const axiosInstance = axios.create({
                ...agent,
                timeout: 15000, // Increased for Top1000 fetch
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
                        url_used: url
                    }
                };
            } else {
                const isAuthError = res.status === 401 || res.status === 403;
                const isClientError = res.status === 400 || res.status === 404;
                
                attemptLog.error_class = 'http';
                attemptLog.error_code = `http_${res.status}`;
                attemptLog.error_message = res.statusText;

                if (!isAuthError && !isClientError) {
                     selector.reportFailure(profile.name, `http_${res.status}`);
                }

                if (isAuthError || isClientError) {
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
                            error_code: `http_${res.status}`,
                            error_message: res.statusText,
                            raw_body: res.data
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

            attemptLog.error_class = errorClass === 'proxy_refused' ? 'tcp' : errorClass;
            attemptLog.error_code = errorCode;
            attemptLog.error_message = error.message;
            
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
            url_used: `${baseUrl}${endpoint}`,
            error_class: lastError?.class === 'proxy_refused' ? 'tcp' : (lastError?.class || 'unknown'),
            error_code: lastError?.code || lastError?.message,
            error_message: lastError?.message
        }
    };
}

export async function fetchPolymarketBookDebug(tokenId: string): Promise<FetchDebugResult> {
    const res = await pmRequest(`/book?token_id=${tokenId}`);
    
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
    // Polymarket returns strings for price/size
    const bids = (data.bids || []).map((l: any) => ({ 
        price: parseFloat(l.price), 
        size: parseFloat(l.size) 
    }));
    const asks = (data.asks || []).map((l: any) => ({ 
        price: parseFloat(l.price), 
        size: parseFloat(l.size) 
    }));

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

export async function getPolymarketBook(tokenId: string): Promise<MarketOrderBook> {
    const result = await fetchPolymarketBookDebug(tokenId);
    return result.parsed_book;
}

export interface PolyMarketDetails {
    id: string;
    question: string;
    outcomes: string[];
    clobTokenIds: string[];
    active: boolean;
    closed: boolean;
}

export async function getPolymarketMarket(id: string): Promise<PolyMarketDetails | null> {
    // Use Gamma API to fetch market details
    const res = await pmRequest(`/markets/${id}`, {}, GAMMA_URL);
    
    if (!res.success) {
        console.warn(`[Polymarket] getPolymarketMarket failed for ${id}: ${res.meta.error_code}`);
        return null;
    }

    const m = res.data;
    if (!m) return null;

    let clobTokenIds: string[] = [];
    try {
        clobTokenIds = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : (m.clobTokenIds || []);
    } catch (e) {}

    let outcomes: string[] = [];
    try {
        outcomes = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : (m.outcomes || []);
    } catch (e) {}

    return {
        id: m.id,
        question: m.question,
        outcomes,
        clobTokenIds,
        active: m.active,
        closed: m.closed
    };
}

export async function fetchPolymarketEvent(slug: string): Promise<any> {
    return await pmRequest(`/events/slug/${slug}`, {}, GAMMA_URL);
}
