
import { ProxyProfile, getProxyProfiles } from '../config/proxies';
import { checkDns, checkTcp } from '../utils/diagnostics';
import axios from 'axios';
import { getAgent } from '../utils/proxy-agent';

interface ProfileState {
    profile: ProxyProfile;
    last_check_at: number;
    status: 'ok' | 'fail' | 'cooldown' | 'unknown';
    latency_ms: number;
    consecutive_fails: number;
    cooldown_until: number;
    last_error?: string;
    fail_reason?: string | null;
}

export interface BestSelection {
    name: string;
    ok: boolean;
    reason: string;
    profile: ProxyProfile;
    all_failed?: boolean;
    overall_fail_reason?: string;
    next_candidate_name?: string;
}

export class ProxySelector {
    private static instance: ProxySelector;
    private states: Map<string, ProfileState> = new Map();
    private profiles: ProxyProfile[] = [];

    private constructor() {
        this.reloadProfiles();
    }

    public static getInstance(): ProxySelector {
        if (!ProxySelector.instance) {
            ProxySelector.instance = new ProxySelector();
        }
        return ProxySelector.instance;
    }

    public reloadProfiles() {
        this.profiles = getProxyProfiles();
        this.profiles.forEach(p => {
            if (!this.states.has(p.name)) {
                this.states.set(p.name, {
                    profile: p,
                    last_check_at: 0,
                    status: 'unknown',
                    latency_ms: 9999,
                    consecutive_fails: 0,
                    cooldown_until: 0,
                    fail_reason: null
                });
            } else {
                 // Update profile if changed
                 const s = this.states.get(p.name)!;
                 s.profile = p;
            }
        });
    }

    public getProfiles(): ProfileState[] {
        return Array.from(this.states.values());
    }

    public async healthCheckAll(): Promise<any[]> {
        const results = [];
        for (const p of this.profiles) {
            if (!p.enabled) continue;
            const res = await this.checkProfile(p);
            results.push(res);
        }
        return results;
    }

    private async checkProfile(profile: ProxyProfile): Promise<any> {
        const hostname = 'api.elections.kalshi.com'; // Target
        const start = Date.now();
        
        let result = {
            name: profile.name,
            type: profile.type,
            enabled: profile.enabled,
            weight: profile.weight,
            proxy_used: profile.type !== 'direct',
            proxy_value_masked: profile.url ? profile.url.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@') : null,
            ok: false,
            http_status: null as number | null,
            latency_ms: 0,
            error_class: null as string | null,
            error_code: null as string | null,
            error_message: null as string | null,
            fail_reason: null as string | null,
            cooldown_until: null as string | null
        };

        try {
            const agent = getAgent(profile, `https://${hostname}/trade-api/v2/exchange/status`);
            const axiosInstance = axios.create({
                timeout: profile.connect_timeout_ms,
                ...agent,
                validateStatus: () => true
            });

            // HTTPS GET /exchange/status
            const res = await axiosInstance.get(`https://${hostname}/trade-api/v2/exchange/status`);
            
            const latency = Date.now() - start;
            result.latency_ms = latency;
            result.http_status = res.status;
            
            if (res.status === 200) {
                this.updateState(profile.name, 'ok', latency);
                result.ok = true;
            } else {
                const reason = `http_${res.status}`;
                this.updateState(profile.name, 'fail', latency, reason, reason);
                result.ok = false;
                result.fail_reason = reason;
                result.error_class = 'http';
            }

        } catch (e: any) {
            const latency = Date.now() - start;
            result.latency_ms = latency;
            
            const errorClass = this.classifyError(e);
            const errorCode = e.code || e.message;
            const errorMsg = e.message;

            this.updateState(profile.name, 'fail', latency, errorCode, errorClass);
            
            result.ok = false;
            result.error_class = errorClass;
            result.error_code = errorCode;
            result.error_message = errorMsg;
            result.fail_reason = errorClass;
        }

        const state = this.states.get(profile.name);
        if (state && state.cooldown_until > Date.now()) {
            result.cooldown_until = new Date(state.cooldown_until).toISOString();
        }

        return result;
    }

    private updateState(name: string, status: 'ok' | 'fail', latency: number, error?: string, failReason?: string) {
        const state = this.states.get(name);
        if (!state) return;

        state.last_check_at = Date.now();
        state.latency_ms = latency;

        if (status === 'ok') {
            state.status = 'ok';
            state.consecutive_fails = 0;
            state.cooldown_until = 0;
            state.last_error = undefined;
            state.fail_reason = null;
        } else {
            // Check if auth error (401/403), do not count as network fail
            if (failReason && (failReason.includes('http_401') || failReason.includes('http_403'))) {
                state.status = 'ok'; // Technically network is OK
                state.consecutive_fails = 0;
                state.fail_reason = null;
            } else {
                state.consecutive_fails++;
                state.last_error = error;
                state.fail_reason = failReason;
                
                // User Requirement: proxy_refused (ECONNREFUSED) should immediately cooldown
                if (failReason === 'proxy_refused') {
                     state.status = 'cooldown';
                     state.cooldown_until = Date.now() + state.profile.cooldown_ms;
                } else if (state.consecutive_fails >= state.profile.max_consecutive_fail) {
                    state.status = 'cooldown';
                    state.cooldown_until = Date.now() + state.profile.cooldown_ms;
                } else {
                    state.status = 'fail';
                }
            }
        }
    }

    public selectBestProfile(excludeNames: Set<string> = new Set()): BestSelection {
        const now = Date.now();
        // Filter out disabled and excluded
        let candidates = Array.from(this.states.values())
            .filter(s => s.profile.enabled)
            .filter(s => !excludeNames.has(s.profile.name));

        // Separate into Available (not cooldown) and Cooldown
        const available = candidates.filter(s => s.status !== 'cooldown' || s.cooldown_until < now);

        if (available.length === 0) {
            // All in cooldown or none enabled/available
            // User Requirement: "当 profiles 全 fail... 优先选 fail_reason != proxy_refused 的... 再选 latency 更低的... weight 只作为最后 tie-break"
            
            // We use ALL candidates (including cooldown ones) for fallback selection logic
            // But we must respect excludeNames (already filtered in candidates)
            
            if (candidates.length === 0) {
                 // Nothing at all (e.g. all excluded)
                 return {
                    name: 'None',
                    ok: false,
                    reason: 'exhausted',
                    profile: this.profiles[0], // dummy
                    all_failed: true,
                    overall_fail_reason: 'exhausted'
                };
            }

            // Find overall fail reason stats
            const failReasons = candidates.map(c => c.fail_reason).filter(r => r);
            const overallReason = failReasons.sort((a,b) => 
                failReasons.filter(v => v===a).length - failReasons.filter(v => v===b).length
            ).pop() || 'unknown_failure';

            // Sort for fallback
            candidates.sort((a, b) => {
                const aRefused = a.fail_reason === 'proxy_refused';
                const bRefused = b.fail_reason === 'proxy_refused';

                if (!aRefused && bRefused) return -1; // Prefer not refused
                if (aRefused && !bRefused) return 1;

                if (a.latency_ms !== b.latency_ms) return a.latency_ms - b.latency_ms; // Low latency
                return b.profile.weight - a.profile.weight; // High weight
            });

            const bestFallback = candidates[0];
            
            // "如果 best.ok=false 且 reason=proxy_refused，则必须给出 next_candidate_name"
            let nextCandidateName = undefined;
            if (bestFallback.fail_reason === 'proxy_refused' && candidates.length > 1) {
                nextCandidateName = candidates[1].profile.name;
            }

            return {
                name: bestFallback.profile.name,
                ok: false,
                reason: bestFallback.fail_reason || 'all_failed',
                profile: bestFallback.profile,
                all_failed: true,
                overall_fail_reason: overallReason,
                next_candidate_name: nextCandidateName
            };
        }

        // Sort available candidates (Standard Logic)
        // Order: OK > HTTP 200 (implied by OK) > Latency > Weight
        available.sort((a, b) => {
            const aOk = a.status === 'ok';
            const bOk = b.status === 'ok';
            
            if (aOk && !bOk) return -1;
            if (!aOk && bOk) return 1;
            
            if (aOk) {
                 if (Math.abs(a.latency_ms - b.latency_ms) > 200) { 
                     return a.latency_ms - b.latency_ms;
                 }
                 return b.profile.weight - a.profile.weight;
            } else {
                 return b.profile.weight - a.profile.weight;
            }
        });

        const best = available[0];
        return {
            name: best.profile.name,
            ok: best.status === 'ok',
            reason: best.status === 'ok' ? 'optimal' : (best.fail_reason || 'probing'),
            profile: best.profile
        };
    }

    public reportFailure(profileName: string, errorClass: string) {
        const state = this.states.get(profileName);
        if (!state) return;
        
        // This is called from khRequest. We delegate to updateState to handle logic.
        this.updateState(profileName, 'fail', 9999, errorClass, errorClass);
    }

    public classifyError(error: any): string {
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
    
    // Helper for specific profile fetch
    public getProfile(name: string): ProxyProfile | undefined {
        return this.states.get(name)?.profile;
    }
}
