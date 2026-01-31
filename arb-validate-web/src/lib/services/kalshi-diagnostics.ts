
import { ProxySelector } from './proxy-selector';
import { getAgent } from '../utils/proxy-agent';
import axios from 'axios';
import dns from 'dns';
import net from 'net';
import tls from 'tls';
import { promisify } from 'util';

const lookup = promisify(dns.lookup);

export interface NetworkHealthResult {
    checked_at: string;
    kalshi_status: 'OK' | 'SLOW' | 'DOWN';
    reason: string;
    http_status: number | null;
    latency_ms: number;
    stage: 'dns' | 'tcp' | 'tls' | 'http' | null;
    error_code: string | null;
    error_message: string | null;
    url_used: string;
    
    // Detailed evidence (for debug endpoint)
    details?: {
        active_profile: string;
        dns: { resolved: boolean, addresses: string[], ms: number, error?: string };
        tcp: { ok: boolean, ms: number, error_code: string | null };
        tls: { ok: boolean, ms: number, error_code: string | null };
        https: { http_status: number | null, latency_ms: number };
        auth_test: { no_key: any, with_key: any };
        proxy_used: boolean;
        proxy_profile: string;
        proxy_value_masked: string | null;
        failed_stage: string | undefined;
    }
}

export async function checkKalshiHealth(includeDetails: boolean = false): Promise<NetworkHealthResult> {
    const selector = ProxySelector.getInstance();
    // Use current best profile state (don't force reload every time for health check to be fast, 
    // but maybe for diagnose we want fresh? User said "Run Network Check" button, so fresh is better)
    // selector.reloadProfiles(); 
    
    const best = selector.selectBestProfile();
    const profile = best.profile;
    const isDirect = profile.type === 'direct';
    const targetHost = 'api.elections.kalshi.com';
    const targetPath = '/trade-api/v2/exchange/status';
    const targetUrl = `https://${targetHost}${targetPath}`;

    const agent = getAgent(profile, targetUrl);

    let details = {
        active_profile: best.ok ? profile.name : "None (all failed)",
        dns: { resolved: false, addresses: [] as string[], ms: 0, error: undefined as string | undefined },
        tcp: { ok: false, ms: 0, error_code: null as string | null },
        tls: { ok: false, ms: 0, error_code: null as string | null },
        https: { http_status: null as number | null, latency_ms: 0 },
        auth_test: { no_key: 'skipped' as any, with_key: 'skipped' as any },
        proxy_used: !isDirect,
        proxy_profile: profile.name,
        proxy_value_masked: profile.url ? profile.url.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@') : null,
        failed_stage: undefined as string | undefined
    };

    const overallStart = Date.now();
    let finalStatus: 'OK' | 'SLOW' | 'DOWN' = 'DOWN';
    let finalReason = 'unknown';
    let failedStage: 'dns' | 'tcp' | 'tls' | 'http' | null = null;
    let finalErrorCode: string | null = null;
    let finalErrorMsg: string | null = null;
    let finalHttpStatus: number | null = null;

    try {
        // 1. Diagnostic Stages (Direct only)
        if (isDirect) {
            // DNS
            const dnsStart = Date.now();
            try {
                const { address } = await lookup(targetHost);
                details.dns.resolved = true;
                details.dns.addresses = [address];
                details.dns.ms = Date.now() - dnsStart;
            } catch (e: any) {
                details.dns.ms = Date.now() - dnsStart;
                details.dns.error = e.code;
                throw { stage: 'dns', code: e.code, message: e.message };
            }

            // TCP
            const tcpStart = Date.now();
            try {
                await new Promise<void>((resolve, reject) => {
                    const socket = net.connect(443, targetHost);
                    socket.setTimeout(5000);
                    socket.on('connect', () => {
                        details.tcp.ms = Date.now() - tcpStart;
                        details.tcp.ok = true;
                        socket.end();
                        resolve();
                    });
                    socket.on('timeout', () => {
                        socket.destroy();
                        reject({ code: 'ETIMEDOUT', message: 'TCP Connection Timed Out' });
                    });
                    socket.on('error', (err) => {
                        reject(err);
                    });
                });
            } catch (e: any) {
                details.tcp.ms = Date.now() - tcpStart;
                details.tcp.error_code = e.code;
                throw { stage: 'tcp', code: e.code, message: e.message };
            }

            // TLS
            const tlsStart = Date.now();
            try {
                await new Promise<void>((resolve, reject) => {
                    const socket = tls.connect(443, targetHost, { servername: targetHost });
                    socket.setTimeout(5000);
                    socket.on('secureConnect', () => {
                        details.tls.ms = Date.now() - tlsStart;
                        details.tls.ok = true;
                        socket.end();
                        resolve();
                    });
                    socket.on('timeout', () => {
                        socket.destroy();
                        reject({ code: 'ETIMEDOUT', message: 'TLS Handshake Timed Out' });
                    });
                    socket.on('error', (err) => {
                        reject(err);
                    });
                });
            } catch (e: any) {
                details.tls.ms = Date.now() - tlsStart;
                details.tls.error_code = e.code;
                throw { stage: 'tls', code: e.code, message: e.message };
            }
        }

        // 2. HTTP Request
        const httpStart = Date.now();
        const axiosInstance = axios.create({
            timeout: profile.request_timeout_ms || 5000,
            ...agent,
            validateStatus: () => true
        });

        let res;
        try {
            res = await axiosInstance.get(targetUrl);
        } catch (e: any) {
             const ms = Date.now() - httpStart;
             details.https.latency_ms = ms;
             
             const code = e.code || e.message;
             let reason = 'unknown_error';

             if (code === 'ECONNREFUSED') reason = 'proxy_refused';
             else if (code === 'ETIMEDOUT') reason = 'timeout';
             else if (code === 'ENOTFOUND') reason = 'dns';
             else if (e.response?.status === 403) reason = 'http_403';
             else if (e.response?.status === 429) reason = 'http_429';
             
             // If direct and passed TCP/TLS, blame HTTP
             const stage = isDirect ? 'http' : (code === 'ENOTFOUND' ? 'dns' : 'http'); // Simplified proxy mapping
             
             throw { stage: stage, code: code, message: e.message, reason: reason };
        }

        const latency = Date.now() - httpStart;
        details.https.latency_ms = latency;
        details.https.http_status = res.status;
        finalHttpStatus = res.status;

        if (res.status === 200) {
            if (latency > 3000) {
                finalStatus = 'SLOW';
                finalReason = 'slow';
            } else {
                finalStatus = 'OK';
                finalReason = 'ok'; // or null? User said "OK" status with reason "ok" implicitly
            }
        } else {
            finalStatus = 'DOWN'; // As per rule: 401/403/429 = DOWN/Reason
            if (res.status === 401) finalReason = 'http_401';
            else if (res.status === 403) finalReason = 'http_403';
            else if (res.status === 429) finalReason = 'http_429';
            else finalReason = `http_${res.status}`;
            failedStage = 'http';
        }

    } catch (e: any) {
        finalStatus = 'DOWN';
        failedStage = e.stage as any;
        finalErrorCode = e.code;
        finalErrorMsg = e.message;
        finalReason = e.reason || e.stage || 'unknown';
        
        // Refine reasons based on stage
        if (e.stage === 'dns') finalReason = 'dns';
        if (e.stage === 'tcp') finalReason = 'tcp';
        if (e.stage === 'tls') finalReason = 'tls';
        if (e.stage === 'http' && e.reason) finalReason = e.reason;

        details.failed_stage = e.stage;
    }

    const totalLatency = Date.now() - overallStart;

    const result: NetworkHealthResult = {
        checked_at: new Date().toISOString(),
        kalshi_status: finalStatus,
        reason: finalReason,
        http_status: finalHttpStatus,
        latency_ms: totalLatency,
        stage: failedStage,
        error_code: finalErrorCode,
        error_message: finalErrorMsg,
        url_used: targetUrl
    };

    if (includeDetails) {
        result.details = details;
    }

    return result;
}
