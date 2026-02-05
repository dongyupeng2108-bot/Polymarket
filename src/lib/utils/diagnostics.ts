
import dns from 'dns';
import net from 'net';
import tls from 'tls';
import { promisify } from 'util';

const resolveDns = promisify(dns.resolve);

export interface DiagnosticResult {
    step: 'dns' | 'tcp' | 'tls' | 'http';
    status: 'ok' | 'fail';
    latency_ms: number;
    details?: any;
    error?: string;
}

export async function checkDns(hostname: string): Promise<DiagnosticResult> {
    const start = Date.now();
    try {
        const addresses = await resolveDns(hostname);
        return {
            step: 'dns',
            status: 'ok',
            latency_ms: Date.now() - start,
            details: addresses
        };
    } catch (e: any) {
        return {
            step: 'dns',
            status: 'fail',
            latency_ms: Date.now() - start,
            error: e.code || e.message
        };
    }
}

export async function checkTcp(hostname: string, port: number): Promise<DiagnosticResult> {
    const start = Date.now();
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(5000);
        
        socket.on('connect', () => {
            const lat = Date.now() - start;
            socket.destroy();
            resolve({ step: 'tcp', status: 'ok', latency_ms: lat });
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve({ step: 'tcp', status: 'fail', latency_ms: Date.now() - start, error: 'ETIMEDOUT' });
        });

        socket.on('error', (e: any) => {
            resolve({ step: 'tcp', status: 'fail', latency_ms: Date.now() - start, error: e.code || e.message });
        });

        socket.connect(port, hostname);
    });
}

export function getProxyStatus() {
    return {
        http_proxy: process.env.http_proxy || process.env.HTTP_PROXY || null,
        https_proxy: process.env.https_proxy || process.env.HTTPS_PROXY || null,
        no_proxy: process.env.no_proxy || process.env.NO_PROXY || null,
        node_tls_reject_unauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED
    };
}
