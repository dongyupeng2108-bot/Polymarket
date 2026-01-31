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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AddPairDialog } from './add-pair-dialog';
import { EditPairDialog } from './edit-pair-dialog';
import { VerificationSettingsDialog } from './verification-settings-dialog';
import { StatusBadge } from './status-badge';
import { useI18n } from '@/lib/i18n/context';
import { Pair } from '@prisma/client';
import { Loader2, Trash2, Sparkles, AlertCircle, CheckCircle2, Info } from 'lucide-react';

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

  // Keep ref in sync with state
  useEffect(() => {
    scanStatusRef.current = scanStatus;
  }, [scanStatus]);

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
    
    // Task 062: Added mve_filter parameter
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
    
    es.addEventListener('done', (e: any) => {
        const data = JSON.parse(e.data);
        setProgress(prev => ({ 
            ...prev, 
            ...(data.summary || {}), 
            message: t('Auto Match Completed'),
            request_id: data.request_id || prev.request_id,
            ts: data.ts || prev.ts,
            debug: data.debug || prev.debug
        }));
        setScanStatus('done');
        setConnectionStatus('closed');
        es.close();
        router.refresh();
    });

    es.addEventListener('complete', (e: any) => {
        const data = JSON.parse(e.data);
        setProgress(prev => ({ 
            ...prev, 
            ...(data.summary || {}), 
            message: t('Auto Match Completed'),
            request_id: data.request_id || prev.request_id,
            ts: data.ts || prev.ts,
            debug: data.debug || prev.debug
        }));
        setScanStatus('done');
        setConnectionStatus('closed');
        es.close();
        router.refresh();
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

        expectedCloseRef.current = true; // Signal that this closure is expected
        es.close();

        if (isOk) {
            setScanStatus('done');
            setConnectionStatus('closed');
            // router.refresh(); // Optional, depending on if we want to refresh immediately
        } else {
            setScanStatus('error');
            setConnectionStatus('terminated');
            
            // Reconnection Policy for Terminated
            // Task 038: STRICTLY NO RETRY on terminated event.
            console.log(`Scan terminated with error: ${data.error_code}. No auto-retry.`);
            // Ensure no pending retries
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
        // Note: We don't stop here, we wait for 'terminated' or 'onerror'
    });

    es.onerror = (e) => {
        if (expectedCloseRef.current) {
            console.debug('SSE Closed (Expected)', e);
            return;
        }
        if (es.readyState === EventSource.CLOSED) return;
        
        // Task 038: Double check if we are already in a terminated state via state ref if needed,
        // but expectedCloseRef should cover it.
        
        console.warn('SSE Error (Unexpected)', e);
        es.close();

        // Check if user cancelled
        if (scanStatusRef.current === 'idle') return;

        // Task 040: Stop UI Reconnecting Loop (TERMINAL state)
        // Instead of retrying, we now terminate immediately to prevent infinite loops.
        setScanStatus('error');
        setConnectionStatus('terminated');
        setProgress(prev => ({ 
            ...prev, 
            message: t('Connection lost. Auto-retry disabled (Task 040).'), 
            error_code: 'SSE_ERROR_TERMINATED'
        }));
        
        // Clear any pending timeouts just in case
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        
        // Previous Retry Logic (Disabled)
        // handleRetry();
    };

    // Helper to handle retries
    const handleRetry = () => {
        setRetryCount(prev => {
            const newCount = prev + 1;
            if (newCount <= 3) {
                console.log(`Connection lost/terminated. Retrying in ${newCount * 1}s...`); // 1s, 2s, 3s
                setConnectionStatus('reconnecting');
                retryTimeoutRef.current = setTimeout(() => {
                    startAutoMatch(true);
                }, 1000 * newCount); 
                return newCount;
            } else {
                setScanStatus('error');
                setConnectionStatus('error');
                setProgress(prev => ({ ...prev, message: t('Connection failed after multiple retries.') }));
                return prev;
            }
        });
    };
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
        <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                    {t('Auto Match New Pairs')}
                    {connectionStatus === 'connecting' && <Badge variant="outline" className="text-yellow-600 border-yellow-200 animate-pulse ml-2 text-xs font-normal">Connecting...</Badge>}
                    {connectionStatus === 'reconnecting' && <Badge variant="outline" className="text-orange-600 border-orange-200 animate-pulse ml-2 text-xs font-normal">Reconnecting ({retryCount})...</Badge>}
                    {connectionStatus === 'open' && <Badge variant="outline" className="text-green-600 border-green-200 ml-2 text-xs font-normal">Live Stream</Badge>}
                    {connectionStatus === 'terminated' && <Badge variant="outline" className="text-gray-600 border-gray-200 ml-2 text-xs font-normal">Failed ({progress.error_code || 'TERMINATED'})</Badge>}
                    {connectionStatus === 'closed' && scanStatus === 'done' && <Badge variant="outline" className="text-blue-600 border-blue-200 ml-2 text-xs font-normal">Completed</Badge>}
                    {connectionStatus === 'error' && <Badge variant="outline" className="text-red-600 border-red-200 ml-2 text-xs font-normal">Error</Badge>}
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
                                <SelectItem value="auto">Auto (Smart Switch)</SelectItem>
                                <SelectItem value="public_all">Public All (Baseline)</SelectItem>
                                <SelectItem value="search_keywords">Search Keywords</SelectItem>
                                <SelectItem value="prefix_filter">Prefix Filter</SelectItem>
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
                                <SelectItem value="exclude">Exclude (Default)</SelectItem>
                                <SelectItem value="only">Only (Debug/Special)</SelectItem>
                                <SelectItem value="none">None (All)</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500">
                            {t('Filters out complex multivariate markets to reduce noise.')}
                        </p>
                    </div>

                    {/* Conditional Inputs for Search/Prefix */}
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
                </div>
            )}

            {scanStatus !== 'idle' && (
                <div className="space-y-4 py-4">
                    <div className="flex justify-between text-sm mb-2">
                        <span className="font-medium">{progress.step}</span>
                        <span>{progress.scanned} {t('Scanned')}</span>
                    </div>
                    
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Matched (Candidates) */}
                        <div className="bg-blue-50 p-3 rounded-lg text-center col-span-2 border border-blue-100">
                            <div className="text-xs text-blue-500 uppercase font-semibold mb-1">{t('Matched Candidates')}</div>
                            <div className="text-3xl font-bold text-blue-600">{progress.matched || progress.candidates}</div>
                            <div className="text-xs text-blue-400 mt-1">from {progress.scanned} scanned events</div>
                        </div>

                        {/* Added (Success) */}
                        <div className="bg-green-50 p-3 rounded-lg text-center border border-green-100">
                            <div className="text-2xl font-bold text-green-600">{progress.added}</div>
                            <div className="text-xs text-green-700 font-medium">{t('Added')}</div>
                        </div>

                        {/* Existing (Skipped) */}
                        <div className="bg-yellow-50 p-3 rounded-lg text-center border border-yellow-100" title={t('Matched but already in database')}>
                            <div className="text-2xl font-bold text-yellow-600">{progress.existing || progress.skipped_existing}</div>
                            <div className="text-xs text-yellow-700 font-medium flex items-center justify-center gap-1">
                                {t('Existing')} <Info className="h-3 w-3" />
                            </div>
                        </div>

                        {/* Filtered (Skipped) */}
                        <div className="bg-gray-50 p-3 rounded-lg text-center border border-gray-100" title={t('Skipped due to filtering (no binary market, no tokens, etc.)')}>
                            <div className="text-2xl font-bold text-gray-600">{progress.skipped || progress.skipped_filtered}</div>
                            <div className="text-xs text-gray-600 font-medium flex items-center justify-center gap-1">
                                {t('Filtered')} <Info className="h-3 w-3" />
                            </div>
                        </div>

                        {/* Errors */}
                        <div className="bg-red-50 p-3 rounded-lg text-center border border-red-100" title={t('Errors during fetch or processing')}>
                            <div className="text-2xl font-bold text-red-600">{progress.failed || progress.errors}</div>
                            <div className="text-xs text-red-700 font-medium">{t('Errors')}</div>
                        </div>
                    </div>

                    {progress.errors > 0 && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>{t('Errors')}</AlertTitle>
                            <AlertDescription>{progress.errors} {t('errors occurred during scan.')}</AlertDescription>
                        </Alert>
                    )}

                    {scanStatus === 'done' && (
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

                            {progress.added === 0 ? (
                                <Alert className="bg-blue-50 border-blue-200">
                                    <Info className="h-4 w-4 text-blue-600" />
                                    <AlertTitle className="text-blue-800">{t('Scan Completed')}</AlertTitle>
                                    <AlertDescription className="text-blue-700">
                                        <div className="font-medium mb-1">
                                            {progress.reason || t('No matching candidates found in this scan range.')}
                                        </div>
                                        <div className="text-xs opacity-80">
                                            {((progress.matched ?? progress.candidates) > 0 && (progress.matched ?? progress.candidates) === (progress.existing ?? progress.skipped_existing))
                                                ? t('All candidates matched were already in the database.')
                                                : t('Try increasing scan limit or changing universe mode.')}
                                        </div>
                                    </AlertDescription>
                                </Alert>
                            ) : (
                                <Alert className="bg-green-50 border-green-200">
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                    <AlertTitle className="text-green-800">{t('Success')}</AlertTitle>
                                    <AlertDescription className="text-green-700">
                                        <div className="font-medium mb-1">
                                            {t('Successfully added {count} new pairs.').replace('{count}', String(progress.added))}
                                        </div>
                                        {progress.reason && (
                                            <div className="text-xs opacity-90 mt-1">
                                                Reason: {progress.reason}
                                            </div>
                                        )}
                                    </AlertDescription>
                                </Alert>
                            )}
                            
                            <div className="mt-2 flex justify-end">
                                <Button size="sm" variant="ghost" className="text-gray-500 hover:bg-gray-100" onClick={() => {
                                    const details = JSON.stringify({
                                        status: 'Completed',
                                        request_id: progress.request_id,
                                        ts: progress.ts,
                                        summary: {
                                            scanned: progress.scanned,
                                            candidates: progress.candidates,
                                            matched: progress.matched,
                                            added: progress.added,
                                            existing: progress.existing,
                                            skipped_existing: progress.skipped_existing,
                                            skipped_filtered: progress.skipped_filtered,
                                            failed: progress.failed,
                                            errors: progress.errors,
                                            reason: progress.reason // Task 055: Explicitly include reason
                                        },
                                        debug: {
                                            auth_present: progress.debug?.auth_present,
                                            kalshi_pages_fetched: progress.debug?.kalshi_pages_fetched,
                                            pm_events_count: progress.debug?.pm_events_count,
                                            kalshi_markets_count: progress.debug?.kalshi_markets_count,
                                            universe_mode: progress.debug?.universe_mode || universeMode,
                                            is_degraded: progress.debug?.is_degraded,
                                            ...progress.debug, // Include other debug fields
                                            universe_request: {
                                                mode: universeMode,
                                                keywords: universeMode === 'search_keywords' ? customKeywords : undefined,
                                                prefixes: universeMode === 'prefix_filter' ? customPrefixes : undefined,
                                                limit: limit,
                                                ...(progress.debug?.kalshi_fetch || {})
                                            }
                                        }
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
                                {progress.stage && (
                                    <div className="text-xs mb-1">
                                        <strong>Stage:</strong> {progress.stage}
                                    </div>
                                )}
                                {progress.http_status ? (
                                    <div className="text-xs mb-1">
                                        <strong>Status:</strong> {progress.http_status}
                                    </div>
                                ) : null}
                                {progress.hint && (
                                    <div className="text-xs bg-red-100/50 p-2 rounded text-red-900 border border-red-200 mb-2">
                                        <strong>Hint:</strong> {progress.hint}
                                    </div>
                                )}
                                {progress.request_id && (
                                    <div className="text-[10px] text-gray-500 mt-2 font-mono">
                                        RID: {progress.request_id}
                                    </div>
                                )}
                                <div className="flex gap-2 mt-2">
                                    <Button size="sm" variant="outline" className="bg-white hover:bg-red-50 text-red-700 border-red-200" onClick={() => startAutoMatch(false)}>
                                        {t('Retry')}
                                    </Button>
                                    <Button size="sm" variant="ghost" className="text-red-700 hover:bg-red-100 hover:text-red-900" onClick={() => {
                                        const details = JSON.stringify({
                                            error_code: progress.error_code,
                                            message: progress.message,
                                            hint: progress.hint,
                                            stage: progress.stage,
                                            http_status: progress.http_status,
                                            request_id: progress.request_id,
                                            ts: progress.ts,
                                            scanned: progress.scanned
                                        }, null, 2);
                                        navigator.clipboard.writeText(details);
                                    }}>
                                        {t('Copy Details')}
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
                    <Button onClick={resetAutoMatch} disabled={scanStatus === 'running'}>
                        {scanStatus === 'running' ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        {scanStatus === 'running' ? t('Scanning...') : t('Close')}
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
                        {pair.unverified_reason ? (
                            <span className="text-red-500 text-sm" title={pair.unverified_reason}>
                                {pair.unverified_reason.length > 50 ? pair.unverified_reason.slice(0, 50) + '...' : pair.unverified_reason}
                            </span>
                        ) : (
                            <span className="text-gray-300">-</span>
                        )}
                    </TableCell>
                    <TableCell>
                      <EditPairDialog pair={pair} />
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
