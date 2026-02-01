'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AddPairDialog } from './add-pair-dialog';
import { EditPairDialog } from './edit-pair-dialog';
import { VerificationSettingsDialog } from './verification-settings-dialog';
import { StatusBadge } from './status-badge';
import { useI18n } from '@/lib/i18n/context';
import { Pair } from '@prisma/client';
import { Loader2, Trash2, Sparkles, AlertCircle, CheckCircle2, Info, RefreshCw } from 'lucide-react';

type PairWithReason = Pair & { unverified_reason?: string | null };

export default function PairsClient({ pairs }: { pairs: PairWithReason[] }) {
  const { t } = useI18n();
  const router = useRouter();
  
  // Auto Match State
  const [autoMatchOpen, setAutoMatchOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'open' | 'closed' | 'error' | 'reconnecting' | 'terminated'>('closed');
  const [limit, setLimit] = useState('200');
  const [universeMode, setUniverseMode] = useState('auto');
  const [mveFilter, setMveFilter] = useState('exclude'); // Task 062: Default exclude
  const [customKeywords, setCustomKeywords] = useState('');
  const [customPrefixes, setCustomPrefixes] = useState('');
  const [autoAddEnabled, setAutoAddEnabled] = useState(false);
  
  // Bulk Add State
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [bulkSummary, setBulkSummary] = useState<{
    added: number;
    existed: number;
    failed: number;
    total: number;
  } | null>(null);
  const [failedItems, setFailedItems] = useState<any[]>([]);

  // Load settings from localStorage on mount
  useEffect(() => {
    const savedMode = localStorage.getItem('pair_scan_universe_mode');
    if (savedMode) setUniverseMode(savedMode);

    const savedMveFilter = localStorage.getItem('pair_scan_mve_filter');
    if (savedMveFilter) setMveFilter(savedMveFilter);
    
    const savedKeywords = localStorage.getItem('pair_scan_custom_keywords');
    if (savedKeywords) setCustomKeywords(savedKeywords);

    const savedPrefixes = localStorage.getItem('pair_scan_custom_prefixes');
    if (savedPrefixes) setCustomPrefixes(savedPrefixes);
  }, []);

  // Save settings when changed
  useEffect(() => {
    localStorage.setItem('pair_scan_universe_mode', universeMode);
  }, [universeMode]);

  useEffect(() => {
    localStorage.setItem('pair_scan_mve_filter', mveFilter);
  }, [mveFilter]);

  useEffect(() => {
    localStorage.setItem('pair_scan_custom_keywords', customKeywords);
  }, [customKeywords]);

  useEffect(() => {
    localStorage.setItem('pair_scan_custom_prefixes', customPrefixes);
  }, [customPrefixes]);
  
  const esRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scanStatusRef = useRef(scanStatus);
  const expectedCloseRef = useRef(false);
  const [retryCount, setRetryCount] = useState(0);
  
    // Candidate List State
    const [candidatesList, setCandidatesList] = useState<any[]>([]);
    const candidatesListRef = useRef<any[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    scanStatusRef.current = scanStatus;
  }, [scanStatus]);

  useEffect(() => {
    candidatesListRef.current = candidatesList;
  }, [candidatesList]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
        if (esRef.current) esRef.current.close();
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  const [progress, setProgress] = useState({ 
    step: '', 
    scanned: 0, 
    candidates: 0, 
    matched: 0,
    added: 0, 
    existing: 0,
    failed: 0,
    skipped_existing: 0, 
    skipped_filtered: 0, 
    errors: 0,
    message: '',
    reason: '',
    error_code: '',
    hint: '',
    stage: '',
    http_status: 0,
    request_id: '',
    ts: 0,
    debug: {} as any
  });
  
  const handleBulkAdd = async (candidates: any[]) => {
    if (candidates.length === 0) {
        setScanStatus('done');
        return;
    }
    
    if (!autoAddEnabled) {
        setScanStatus('done');
        setProgress(prev => ({ ...prev, message: t('Auto Add Disabled') }));
        return;
    }
    
    setIsBulkAdding(true);
    
    // Limit to Top 50
    const autoAddLimit = 50;
    const targetCandidates = candidates.slice(0, autoAddLimit);
    const isLimited = candidates.length > autoAddLimit;
    
    setProgress(prev => ({ 
        ...prev, 
        message: t('Auto Adding...') + (isLimited ? ' (' + t('Top {count} candidates added.').replace('{count}', autoAddLimit.toString()) + ')' : '') 
    }));

    try {
        const payload = {
            candidates: targetCandidates.map(c => ({
                pm_id: c.pm_id,
                kh_ticker: c.kh_ticker,
                pm_title: c.pm_title,
                kh_title: c.kh_title,
                score: c.score
            }))
        };

        const res = await fetch('/api/pairs/bulk-create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (res.ok) {
            setBulkSummary({
                added: data.summary.added,
                existed: data.summary.existed,
                failed: data.summary.failed,
                total: targetCandidates.length
            });

            // Update candidates list status based on results
            const results = data.results;
            setCandidatesList(prev => {
                const next = [...prev];
                results.forEach((r: any, i: number) => {
                   const inputCandidate = targetCandidates[i];
                   // Find in list (match by ID + Ticker)
                   const targetIndex = next.findIndex(c => c.pm_id === inputCandidate.pm_id && c.kh_ticker === inputCandidate.kh_ticker);
                   if (targetIndex !== -1) {
                       next[targetIndex] = {
                           ...next[targetIndex],
                           is_added: r.status === 'added',
                           is_existing: r.status === 'existed',
                           is_failed: r.status === 'failed',
                           fail_reason: r.reason
                       };
                   }
                });
                return next;
            });

            if (data.summary.failed > 0) {
                const failed = targetCandidates.filter((_, i) => results[i].status === 'failed');
                setFailedItems(failed);
            } else {
                setFailedItems([]);
            }

            setProgress(prev => ({ 
                ...prev, 
                message: t('Bulk Add Complete') + (isLimited ? ` (${t('Top {count} candidates added.').replace('{count}', autoAddLimit.toString())})` : ''),
                added: (prev.added || 0) + data.summary.added,
                existing: (prev.existing || 0) + data.summary.existed,
                failed: (prev.failed || 0) + data.summary.failed
            }));

        } else {
             console.error("Bulk add failed", data);
             setProgress(prev => ({ ...prev, message: t('Error') + ': ' + (data.message || data.error) }));
        }
    } catch (e) {
        console.error("Bulk add exception", e);
        setProgress(prev => ({ ...prev, message: t('Network error') }));
    } finally {
        setIsBulkAdding(false);
        setScanStatus('done');
        router.refresh();
    }
  };

  const startAutoMatch = (isRetry = false) => {
    if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
    }
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

    setScanStatus('running');
    
    if (!isRetry) {
        expectedCloseRef.current = false;
        setConnectionStatus('connecting');
        setRetryCount(0);
        setCandidatesList([]); // Reset candidates
        setBulkSummary(null);
        setFailedItems([]);
        setIsBulkAdding(false);
        setProgress({  
            step: t('Initializing...'),  
            scanned: 0, 
            candidates: 0, 
            matched: 0,
            added: 0, 
            existing: 0,
            failed: 0,
            skipped_existing: 0, 
            skipped_filtered: 0, 
            errors: 0,
            message: '',
            reason: '',
            error_code: '',
            hint: '',
            stage: '',
            http_status: 0,
            request_id: '',
            ts: 0,
            debug: {}
        });
    } else {
        setConnectionStatus('reconnecting');
    }
    
    let url = `/api/pairs/auto-match/stream?limit=${limit}&kh_mode=${universeMode}&mve_filter=${mveFilter}`;
    if (universeMode === 'search_keywords' && customKeywords) {
        url += `&keywords=${encodeURIComponent(customKeywords)}`;
    }
    if (universeMode === 'prefix_filter' && customPrefixes) {
        url += `&prefixes=${encodeURIComponent(customPrefixes)}`;
    }

    const es = new EventSource(url);
    esRef.current = es;
    
    es.onopen = () => {
        setConnectionStatus('open');
        setRetryCount(0);
    };

    es.addEventListener('progress', (e: any) => {
        const data = JSON.parse(e.data);
        setProgress(prev => ({ ...prev, ...data }));
    });

    es.addEventListener('candidate', (e: any) => {
        const candidate = JSON.parse(e.data);
        setCandidatesList(prev => {
            // Limit to 200 for Bulk Add Safety
            if (prev.length >= 200) return prev;
            // Avoid duplicates
            if (prev.some(c => c.pm_id === candidate.pm_id && c.kh_ticker === candidate.kh_ticker)) return prev;
            return [...prev, candidate];
        });
    });
    
    es.addEventListener('done', (e: any) => {
        const data = JSON.parse(e.data);
        setProgress(prev => ({ 
            ...prev, 
            ...(data.summary || {}), 
            message: t('Scan complete'),
            request_id: data.request_id || prev.request_id,
            ts: data.ts || prev.ts,
            debug: data.debug || prev.debug
        }));
        setConnectionStatus('closed');
        es.close();
        
        // Trigger Bulk Add
        handleBulkAdd(candidatesListRef.current);
    });

    es.addEventListener('complete', (e: any) => {
        const data = JSON.parse(e.data);
        setProgress(prev => ({ 
            ...prev, 
            ...(data.summary || {}), 
            message: t('Scan complete'),
            request_id: data.request_id || prev.request_id,
            ts: data.ts || prev.ts,
            debug: data.debug || prev.debug
        }));
        setConnectionStatus('closed');
        es.close();

        // Trigger Bulk Add
        handleBulkAdd(candidatesListRef.current);
    });

    es.addEventListener('terminated', (e: any) => {
        const data = JSON.parse(e.data);
        const isOk = data.ok === true;
        
        setProgress(prev => ({ 
            ...prev, 
            ...(data.summary_final || data.summary_partial || {}), 
            message: data.message || prev.message,
            error_code: data.error_code || prev.error_code,
            hint: data.hint || prev.hint,
            stage: data.stage || prev.stage,
            http_status: data.http_status || prev.http_status,
            request_id: data.request_id || prev.request_id,
            ts: data.ts || prev.ts,
            debug: data.debug || prev.debug
        }));

        expectedCloseRef.current = true;
        es.close();

        if (isOk) {
            setConnectionStatus('closed');
            handleBulkAdd(candidatesListRef.current);
        } else {
            setScanStatus('error');
            setConnectionStatus('terminated');
            if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        }
    });
    
    es.addEventListener('error', (e: any) => {
        const data = JSON.parse(e.data);
        setProgress(prev => ({ 
            ...prev, 
            message: data.message, 
            error_code: data.error_code, 
            hint: data.hint, 
            stage: data.stage,
            http_status: data.http_status,
            request_id: data.request_id,
            ts: data.ts,
            ...(data.summary_partial || {}) 
        }));
    });

    es.onerror = (e) => {
        if (expectedCloseRef.current) {
            return;
        }
        if (es.readyState === EventSource.CLOSED) return;
        
        console.warn('SSE Error (Unexpected)', e);
        es.close();

        if (scanStatusRef.current === 'idle') return;

        setScanStatus('error');
        setConnectionStatus('terminated');
        setProgress(prev => ({ 
            ...prev, 
            message: t('Connection lost. Auto-retry disabled (Task 040).'), 
            error_code: 'SSE_ERROR_TERMINATED'
        }));
        
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  };

  const handleAddPair = async (candidate: any, index: number) => {
    try {
        setCandidatesList(prev => {
            const newList = [...prev];
            newList[index] = { ...newList[index], is_adding: true };
            return newList;
        });

        const payload = {
            pm_market_id: candidate.pm_id,
            title_pm: candidate.pm_title,
            pm_market_slug: null,
            kh_ticker: candidate.kh_ticker,
            title_kh: candidate.kh_title,
            status: 'unverified',
            confidence: parseFloat(candidate.score),
            pm_yes_token_id: null,
            pm_no_token_id: null,
            kh_yes_contract_id: candidate.kh_ticker,
            kh_no_contract_id: null
        };

        const res = await fetch('/api/pairs', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            setCandidatesList(prev => {
                const newList = [...prev];
                newList[index] = { ...newList[index], is_adding: false, is_added: true };
                return newList;
            });
            setProgress(prev => ({ ...prev, added: prev.added + 1 }));
            router.refresh();
        } else {
            const err = await res.json();
            if (err.error && err.error.includes('Unique constraint')) {
                 setCandidatesList(prev => {
                    const newList = [...prev];
                    newList[index] = { ...newList[index], is_adding: false, is_existing: true };
                    return newList;
                });
                setProgress(prev => ({ ...prev, existing: prev.existing + 1 }));
            } else {
                alert(t('Failed to add pair: ') + err.error);
                setCandidatesList(prev => {
                    const newList = [...prev];
                    newList[index] = { ...newList[index], is_adding: false };
                    return newList;
                });
            }
        }
    } catch (e) {
        console.error(e);
        setCandidatesList(prev => {
            const newList = [...prev];
            newList[index] = { ...newList[index], is_adding: false };
            return newList;
        });
    }
  };

  const resetAutoMatch = () => {
      expectedCloseRef.current = true;
      if (esRef.current) {
          esRef.current.close();
          esRef.current = null;
      }
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      
      setAutoMatchOpen(false);
      setTimeout(() => {
          setScanStatus('idle');
          setConnectionStatus('closed');
          setLimit('200');
          setIsBulkAdding(false);
          setBulkSummary(null);
          setFailedItems([]);
      }, 300);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{t('Pairs Management')}</h1>
        <div className="flex gap-2">
            <Button 
                variant="ghost" 
                onClick={() => setAutoMatchOpen(true)} 
                className="gap-2 bg-green-100 text-green-800 hover:bg-green-200"
            >
                <Sparkles className="h-4 w-4" />
                {t('Auto Match New Pairs')}
            </Button>

            <AddPairDialog triggerClassName="bg-green-100 text-green-800 hover:bg-green-200" />
            
            <VerificationSettingsDialog />
        </div>
      </div>

      <Dialog open={autoMatchOpen} onOpenChange={(open) => !open && resetAutoMatch()}>
        <DialogContent className="max-w-[900px] w-[min(900px,95vw)] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    {t('Auto Match New Pairs')}
                    {connectionStatus === 'connecting' && <Badge variant="outline" className="text-yellow-600 border-yellow-200 animate-pulse ml-2 text-xs font-normal">{t('Connecting...')}</Badge>}
                    {connectionStatus === 'reconnecting' && <Badge variant="outline" className="text-orange-600 border-orange-200 animate-pulse ml-2 text-xs font-normal">{t('Reconnecting ({retryCount})...').replace('{retryCount}', retryCount.toString())}</Badge>}
                    {connectionStatus === 'open' && <Badge variant="outline" className="text-green-600 border-green-200 ml-2 text-xs font-normal">{t('Live Stream')}</Badge>}
                    {connectionStatus === 'terminated' && <Badge variant="outline" className="text-gray-600 border-gray-200 ml-2 text-xs font-normal">{t('Failed')} ({progress.error_code || 'TERMINATED'})</Badge>}
                    {connectionStatus === 'closed' && scanStatus === 'done' && <Badge variant="outline" className="text-blue-600 border-blue-200 ml-2 text-xs font-normal">{t('Completed')}</Badge>}
                    {connectionStatus === 'error' && <Badge variant="outline" className="text-red-600 border-red-200 ml-2 text-xs font-normal">{t('Error')}</Badge>}
                </DialogTitle>
                <DialogDescription>
                    {t('Scan Polymarket events and match with Kalshi markets automatically.')}
                </DialogDescription>
            </DialogHeader>

            {scanStatus === 'idle' && (
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>{t('Scan Limit')}</Label>
                        <Select value={limit} onValueChange={setLimit}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="200">200 ({t('Quick')})</SelectItem>
                                <SelectItem value="500">500</SelectItem>
                                <SelectItem value="1000">1000</SelectItem>
                                <SelectItem value="2000">2000</SelectItem>
                                <SelectItem value="5000">5000 ({t('Deep')})</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500">
                            {t('Higher limits take longer but find more pairs.')}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>{t('Universe Mode')}</Label>
                        <Select value={universeMode} onValueChange={setUniverseMode}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="auto">Auto ({t('Smart Switch')})</SelectItem>
                                <SelectItem value="public_all">{t('Public All (Baseline)')}</SelectItem>
                                <SelectItem value="search_keywords">{t('Search Keywords')}</SelectItem>
                                <SelectItem value="prefix_filter">{t('Prefix Filter')}</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500">
                            {t('Controls how Kalshi markets are fetched.')}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label>{t('Multivariate Event Filter (KXMV)')}</Label>
                        <Select value={mveFilter} onValueChange={setMveFilter}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="exclude">{t('Exclude (Default)')}</SelectItem>
                                <SelectItem value="only">{t('Only (Debug/Special)')}</SelectItem>
                                <SelectItem value="none">{t('None (All)')}</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500">
                            {t('Filters out complex multivariate markets to reduce noise.')}
                        </p>
                    </div>

                    {universeMode === 'search_keywords' && (
                        <div className="space-y-2 pl-4 border-l-2 border-gray-100">
                            <Label>{t('Custom Keywords (comma separated)')}</Label>
                            <Input 
                                value={customKeywords} 
                                onChange={(e) => setCustomKeywords(e.target.value)} 
                                placeholder="crypto, bitcoin, election" 
                            />
                            <p className="text-xs text-gray-500">
                                {t('Defaults: crypto, bitcoin, politics, election')}
                            </p>
                        </div>
                    )}

                    {universeMode === 'prefix_filter' && (
                        <div className="space-y-2 pl-4 border-l-2 border-gray-100">
                            <Label>{t('Allowed Prefixes (comma separated)')}</Label>
                            <Input 
                                value={customPrefixes} 
                                onChange={(e) => setCustomPrefixes(e.target.value)} 
                                placeholder="KXCRYPTO, KXELECTION" 
                            />
                            <p className="text-xs text-gray-500">
                                {t('Leave empty to use system defaults.')}
                            </p>
                        </div>
                    )}

                    <div className="flex items-center space-x-2 pt-4 border-t border-gray-100">
                        <Switch id="auto-add" checked={autoAddEnabled} onCheckedChange={setAutoAddEnabled} />
                        <Label htmlFor="auto-add">{t('Auto Add Matched Pairs')}</Label>
                    </div>
                    <p className="text-xs text-gray-500 pl-12">
                         {t('Only top {limit} candidates will be added automatically.').replace('{limit}', '50')}
                    </p>
                </div>
            )}

            {scanStatus !== 'idle' && (
                <div className="space-y-4 py-4">
                    {/* Progress Bar or Message */}
                    <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium">{progress.message || progress.step}</span>
                        <span>{progress.scanned} {t('Scanned')}</span>
                    </div>
                    
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Matched (Candidates) */}
                        <div className="bg-blue-50 p-3 rounded-lg text-center col-span-2 border border-blue-100">
                            <div className="text-xs text-blue-500 uppercase font-semibold mb-1">{t('Matched Candidates')}</div>
                            <div className="text-3xl font-bold text-blue-600">{progress.matched || progress.candidates}</div>
                            <div className="text-xs text-blue-400 mt-1">{t('from {count} scanned events').replace('{count}', String(progress.scanned))}</div>
                        </div>

                        {/* Added (Success) */}
                        <div className="bg-green-50 p-3 rounded-lg text-center border border-green-100">
                            <div className="text-2xl font-bold text-green-600">{bulkSummary ? bulkSummary.added : progress.added}</div>
                            <div className="text-xs text-green-700 font-medium">{t('Added')}</div>
                        </div>

                        {/* Existing (Skipped) */}
                        <div className="bg-yellow-50 p-3 rounded-lg text-center border border-yellow-100" title={t('Matched but already in database')}>
                            <div className="text-2xl font-bold text-yellow-600">{bulkSummary ? bulkSummary.existed : (progress.existing || progress.skipped_existing)}</div>
                            <div className="text-xs text-yellow-700 font-medium flex items-center justify-center gap-1">
                                {t('Existing')} <Info className="h-3 w-3" />
                            </div>
                        </div>
                    </div>

                    {isBulkAdding && (
                        <div className="flex flex-col items-center justify-center py-4 space-y-2">
                            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                            <p className="text-sm text-gray-500">{t('Processing...')} {candidatesList.length} {t('candidates')}</p>
                        </div>
                    )}

                    {/* Candidate List */}
                    {candidatesList.length > 0 && (
                      <div className="mt-4 border-t pt-4">
                        <h4 className="text-sm font-medium mb-2">{t('Candidates (Top {count})').replace('{count}', String(candidatesList.length))}</h4>
                        <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                          {candidatesList.map((c, i) => (
                            <div key={`${c.pm_id}-${c.kh_ticker}`} className="text-xs border rounded p-2 bg-gray-50">
                              <div className="flex justify-between items-start mb-1">
                                <div className="font-medium text-blue-700 truncate w-2/3" title={c.pm_title}>
                                  PM: {c.pm_title}
                                </div>
                                <div className="font-mono text-gray-500">{c.score}</div>
                              </div>
                              <div className="flex justify-between items-start mb-2">
                                <div className="text-gray-600 truncate w-2/3" title={c.kh_title}>
                                  KH: {c.kh_title} ({c.kh_ticker})
                                </div>
                                {c.is_low_confidence && (
                                  <span className="bg-amber-100 text-amber-800 px-1 rounded text-[10px]">{t('Low Conf')}</span>
                                )}
                              </div>
                              
                              <div className="flex justify-end">
                                {c.is_added ? (
                                  <span className="text-green-600 font-medium px-2 py-1 bg-green-50 rounded border border-green-100 flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> {t('Added')}
                                  </span>
                                ) : c.is_existing ? (
                                  <span className="text-amber-600 font-medium px-2 py-1 bg-amber-50 rounded border border-amber-100 flex items-center gap-1">
                                    <Info className="h-3 w-3" /> {t('Existing')}
                                  </span>
                                ) : c.is_failed ? (
                                    <span className="text-red-600 font-medium px-2 py-1 bg-red-50 rounded border border-red-100 flex items-center gap-1" title={c.fail_reason}>
                                    <AlertCircle className="h-3 w-3" /> {t('Failed')}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 font-medium px-2 py-1 bg-gray-50 rounded border border-gray-100">
                                    {t('Pending...')}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Bulk Add Summary & Retry */}
                    {!isBulkAdding && scanStatus === 'done' && failedItems.length > 0 && (
                         <div className="mt-4 flex justify-center">
                            <Button onClick={() => handleBulkAdd(failedItems)} variant="destructive" size="sm" className="gap-2">
                                <RefreshCw className="h-4 w-4" />
                                {t('Retry Failed Items')} ({failedItems.length})
                            </Button>
                         </div>
                    )}

                    {progress.errors > 0 && !bulkSummary && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>{t('Errors')}</AlertTitle>
                            <AlertDescription>{progress.errors} {t('errors occurred during scan.')}</AlertDescription>
                        </Alert>
                    )}

                    {!isBulkAdding && scanStatus === 'done' && (
                        <div className="mt-4">
                            {/* Task 055: Diagnostic Hint for Domain Mismatch */}
                            {progress.debug?.domain_mismatch_guess?.is_mismatch && (
                                <Alert className="mb-4 bg-yellow-50 border-yellow-200">
                                    <Sparkles className="h-4 w-4 text-yellow-600" />
                                    <AlertTitle className="text-yellow-800">{t('Domain Mismatch Suspected')}</AlertTitle>
                                    <AlertDescription className="text-yellow-700">
                                        {progress.debug.domain_mismatch_guess.reason}
                                    </AlertDescription>
                                </Alert>
                            )}

                            {bulkSummary && bulkSummary.added > 0 ? (
                                <Alert className="bg-green-50 border-green-200">
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    <AlertTitle className="text-green-800">{t('Bulk Add Complete')}</AlertTitle>
                                    <AlertDescription className="text-green-700">
                                        <div className="font-medium mb-1">
                                            {t('Successfully added {count} new pairs.').replace('{count}', String(bulkSummary.added))}
                                        </div>
                                    </AlertDescription>
                                </Alert>
                            ) : bulkSummary && bulkSummary.added === 0 && bulkSummary.existed > 0 ? (
                                <Alert className="bg-yellow-50 border-yellow-200">
                                    <Info className="h-4 w-4 text-yellow-600" />
                                    <AlertTitle className="text-yellow-800">{t('Scan Completed')}</AlertTitle>
                                    <AlertDescription className="text-yellow-700">
                                        {t('All candidates matched were already in the database.')}
                                    </AlertDescription>
                                </Alert>
                            ) : candidatesList.length === 0 ? (
                                <Alert className="bg-blue-50 border-blue-200">
                                    <Info className="h-4 w-4 text-blue-600" />
                                    <AlertTitle className="text-blue-800">{t('Scan Completed')}</AlertTitle>
                                    <AlertDescription className="text-blue-700">
                                        {t('No matching candidates found in this scan range.')}
                                    </AlertDescription>
                                </Alert>
                            ) : null}
                            
                            <div className="mt-2 flex justify-end">
                                <Button size="sm" variant="ghost" className="text-gray-500 hover:bg-gray-100" onClick={() => {
                                    const details = JSON.stringify({
                                        status: 'Completed',
                                        request_id: progress.request_id,
                                        ts: progress.ts,
                                        summary: bulkSummary || progress,
                                        debug: progress.debug
                                    }, null, 2);
                                    
                                    navigator.clipboard.writeText(details).catch(err => {
                                        console.error('Clipboard failed', err);
                                        prompt("Copy Details:", details);
                                    });
                                }}>
                                    {t('Copy Details')}
                                </Button>
                            </div>
                        </div>
                    )}
                    
                    {scanStatus === 'error' && (
                         <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>{t('Error')}{progress.error_code ? `: ${progress.error_code}` : ''}</AlertTitle>
                            <AlertDescription>
                                <div className="font-medium mb-1">{progress.message}</div>
                                <div className="flex gap-2 mt-2">
                                    <Button size="sm" variant="outline" className="bg-white hover:bg-red-50 text-red-700 border-red-200" onClick={() => startAutoMatch(false)}>
                                        {t('Retry')}
                                    </Button>
                                </div>
                            </AlertDescription>
                        </Alert>
                    )}
                </div>
            )}

            <DialogFooter>
                {scanStatus === 'idle' ? (
                    <div className="flex gap-2 justify-end w-full">
                        <Button variant="outline" onClick={() => setAutoMatchOpen(false)}>{t('Cancel')}</Button>
                        <Button onClick={() => startAutoMatch(false)}>
                            {t('Start Scan')}
                        </Button>
                    </div>
                ) : (
                    <Button onClick={resetAutoMatch} disabled={scanStatus === 'running' || isBulkAdding}>
                        {scanStatus === 'running' || isBulkAdding ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {scanStatus === 'running' ? t('Scanning...') : isBulkAdding ? t('Processing...') : t('Close')}
                    </Button>
                )}
            </DialogFooter>
        </DialogContent>
      </Dialog>


      <Card>
        <CardHeader>
          <CardTitle>{t('Event Mappings')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('ID')}</TableHead>
                <TableHead>{t('Title (PM / KH)')}</TableHead>
                <TableHead>{t('Resolve Time')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead>{t('Unverified Reason')}</TableHead>
                <TableHead>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pairs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-gray-500">
                    {t('No pairs found. Add your first event mapping.')}
                  </TableCell>
                </TableRow>
              ) : (
                pairs.map((pair) => (
                  <TableRow key={pair.id}>
                    <TableCell>#{pair.id}</TableCell>
                    <TableCell className="max-w-md">
                      <div className="font-medium truncate" title={pair.title_pm}>PM: {pair.title_pm}</div>
                      <div className="text-sm text-gray-500 truncate" title={pair.title_kh}>KH: {pair.title_kh}</div>
                      <div className="flex gap-2 text-xs mt-1">
                        {pair.pm_open_url && <a href={pair.pm_open_url} target="_blank" className="text-blue-500 hover:underline">{t('Open PM')}</a>}
                        {pair.kh_open_url && <a href={pair.kh_open_url} target="_blank" className="text-blue-500 hover:underline">{t('Open KH')}</a>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div>PM: {new Date(pair.resolve_time_pm).toLocaleDateString()}</div>
                        <div>KH: {new Date(pair.resolve_time_kh).toLocaleDateString()}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={pair.status} />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-500 truncate max-w-[150px]" title={pair.unverified_reason || ''}>
                        {pair.unverified_reason || '-'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <EditPairDialog pair={pair} />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={async () => {
            if (confirm(t('Are you sure you want to delete this pair? This cannot be undone.'))) {
              try {
                const res = await fetch(`/api/pairs/${pair.id}`, { method: 'DELETE' });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || t('Failed to delete pair'));
                router.refresh();
              } catch (error: any) {
                console.error(error);
                alert(t('Error deleting pair: ') + (error.message || error));
              }
            }
          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
