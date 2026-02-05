
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, ExternalLink, Play, StopCircle, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react';
import { buildPolymarketUrl, buildKalshiUrl } from '@/lib/utils/links';
import { useI18n } from '@/lib/i18n/context';
import { calculatePaperTrade, PaperTradeConfig, PaperTradeResult } from '@/lib/sim/paperTradingModel';
import { ScanResult } from '@/lib/services/scanner';

// Default Config for MVP (Hidden from UI)
const DEFAULT_PAPER_CONFIG: PaperTradeConfig = {
    virtualFund: 10000,
    platforms: {
        pm: { id: 'pm', makerFeeRate: 0, takerFeeRate: 0.1, makerIncentivePerShare: 0, slippageModel: { enabled: true, useDepth: true } },
        kh: { id: 'kh', makerFeeRate: 0, takerFeeRate: 0.1, makerIncentivePerShare: 0, slippageModel: { enabled: true, useDepth: true } }
    }
};

interface RuntimeConfig {
    opp_mode: 'dev' | 'prod';
    opp_threshold: number;
    proxy_env_present: boolean;
}

// Lazy Accordion Component
const TickerGroup = ({ ticker, items, renderItem, limit }: { ticker: string, items: any[], renderItem: (item: any) => React.ReactNode, limit: number }) => {
    const [isOpen, setIsOpen] = useState(false);
    
    // Only render content if open
    return (
        <div className="border rounded-md bg-card">
            <div 
                onClick={() => setIsOpen(!isOpen)} 
                className="p-3 cursor-pointer hover:bg-muted/50 font-bold flex justify-between items-center select-none transition-colors"
            >
                <div className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <span>{ticker}</span>
                    <Badge variant="secondary" className="text-xs">{items.length}</Badge>
                </div>
            </div>
            {isOpen && (
                <div className="p-3 grid gap-4 border-t animate-in slide-in-from-top-1 duration-200">
                    {items.slice(0, limit).map(renderItem)}
                    {items.length > limit && (
                        <div className="text-center py-2 text-sm text-muted-foreground bg-muted/20 rounded">
                            Showing top {limit} of {items.length} items
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default function OpportunitiesPage() {
  const { t } = useI18n();
  const [data, setData] = useState<{ item: any, evResult: PaperTradeResult }[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [lastScanMeta, setLastScanMeta] = useState<any>(null);

  // Scan Controls (Moved from Settings)
  const [isAutoScanning, setIsAutoScanning] = useState(false);
  const [scanInterval, setScanInterval] = useState(5000);

  // Filters & Controls
  const [eventFilter, setEventFilter] = useState('KXFEDCHAIRNOM');
  const [minNetEv, setMinNetEv] = useState<string>('0');
  const [showInsufficientDepth, setShowInsufficientDepth] = useState(false);
  const [onlyTradeable, setOnlyTradeable] = useState(false); // Default to FALSE as requested
  const [showAll, setShowAll] = useState(false);

  // New State for Mode & Tickers
  const [scanMode, setScanMode] = useState<'single' | 'all'>('single');
  const [maxPairs, setMaxPairs] = useState('200');
  const [eventTickers, setEventTickers] = useState<{value: string, label: string}[]>([]);
  const [rawTickerData, setRawTickerData] = useState<{eventTicker: string, pairCount: number, verifiedCount: number}[]>([]);

  // Fetch Tickers & Load Persistence
  useEffect(() => {
      fetch('/api/event-tickers')
          .then(res => res.json())
          .then(data => {
              if (data.items) {
                  setRawTickerData(data.items);
                  setEventTickers(data.items.map((i: any) => ({
                      value: i.eventTicker,
                      label: `${i.eventTicker} (${i.verifiedCount}/${i.pairCount})`
                  })));
              }
          });

      const savedMode = localStorage.getItem('arb_scan_mode');
      if (savedMode) setScanMode(savedMode as 'single' | 'all');
      
      const savedTicker = localStorage.getItem('arb_event_ticker');
      if (savedTicker) setEventFilter(savedTicker);
      
      const savedMaxPairs = localStorage.getItem('arb_max_pairs');
      if (savedMaxPairs) setMaxPairs(savedMaxPairs);
  }, []);

  // Save Persistence
  useEffect(() => {
      localStorage.setItem('arb_scan_mode', scanMode);
      if (eventFilter) localStorage.setItem('arb_event_ticker', eventFilter);
      localStorage.setItem('arb_max_pairs', maxPairs);
  }, [scanMode, eventFilter, maxPairs]);

  // Initial Fetch & Filter Change
  useEffect(() => {
    fetchConfig();
    fetchData();
  }, [showAll]);

  const fetchConfig = async () => {
      try {
          const res = await fetch('/api/config');
          setConfig(await res.json());
      } catch (e) {
          console.error("Config fetch failed", e);
      }
  };

  // --- Helper: Convert Evaluation to ScanResult & Calculate EV ---
  const enrichItem = (item: any): { item: any, evResult: PaperTradeResult } => {
      // Construct ScanResult-like object from Evaluation item
      // Note: Evaluation has pm_price_bid etc. and market_data.
      // ScanResult needs prices object and market_data.
      
      const scanResult: ScanResult = {
          pair_id: item.pair_id,
          timestamp: item.ts,
          status: 'ok',
          result: 'OPPORTUNITY', // Dummy
          threshold: '0',
          debug_stats: { pm: item.debug_info?.pm, kh: item.debug_info?.kh },
          prices: {
              pm_bid: item.pm_price_bid,
              pm_ask: item.pm_price_ask,
              kh_bid: item.kh_price_bid,
              kh_ask: item.kh_price_ask
          },
          market_data: item.market_data // Ensure this is correct structure
      };

      // Calculate EV using TakerTaker
      const evResult = calculatePaperTrade(scanResult, DEFAULT_PAPER_CONFIG, 'TakerTaker');
      return { item, evResult };
  };

  const isSnapshotStale = (ts: string) => {
      const diff = Date.now() - new Date(ts).getTime();
      return diff > 60000; // 60s
  };

  const handleVerifyPair = async (pairId: number) => {
      try {
          const res = await fetch(`/api/scan/batch?pairIds=${pairId}`, { method: 'POST' });
          const json = await res.json();
          if (json.results && json.results.length > 0) {
              const newResult = json.results[0];
              // Update local state if it's an opportunity
              if (newResult.result === 'OPPORTUNITY') {
                  const enriched = enrichItem(newResult);
                  setData(prev => {
                      const idx = prev.findIndex(p => p.item.pair_id === pairId);
                      if (idx >= 0) {
                          const newData = [...prev];
                          newData[idx] = enriched;
                          return newData;
                      }
                      return [enriched, ...prev];
                  });
              } else {
                  // If no longer an opportunity, maybe remove it? Or show status?
                  // For now, let's just alert
                  alert(`Scan complete: ${newResult.result} (Net EV: ${newResult.simulation?.expected_profit?.toFixed(2) || 0})`);
              }
          }
      } catch (e) {
          console.error("Verify failed", e);
      }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('all', String(showAll));
      params.append('limit', '500');

      // Add eventTicker query param if in single mode
      if (scanMode === 'single' && eventFilter) {
          params.append('eventTicker', eventFilter);
      }

      const res = await fetch(`/api/opportunities?${params.toString()}`);
      const json = await res.json();
      
      // 1. Enrich
      let enriched = json.map((item: any) => enrichItem(item));

      // 2. Dedup
      const uniqueMap = new Map();
      enriched.forEach((entry: { item: any, evResult: PaperTradeResult }) => {
          if (showAll) {
             // Logs: Dedup by ID
             uniqueMap.set(entry.item.id, entry);
          } else {
             // Opportunities: Latest per pair
             // Key: pair_id. Since API sorts by ts desc, the first one encountered is the latest.
             if (!uniqueMap.has(entry.item.pair_id)) {
                 uniqueMap.set(entry.item.pair_id, entry);
             }
          }
      });
      let processed = Array.from(uniqueMap.values());

      // 3. Limit (Full Lib Mode rules)
      if (scanMode === 'all' && !showAll) {
          // Group by eventTicker
          const byTicker: Record<string, typeof processed> = {};
          processed.forEach(p => {
              const t = p.item.pair?.kh_ticker || 'Other';
              if (!byTicker[t]) byTicker[t] = [];
              byTicker[t].push(p);
          });
          
          let limited: typeof processed = [];
          Object.values(byTicker).forEach(list => {
              limited.push(...list.slice(0, 20)); // Top 20 per ticker
          });
          
          // Global Top 200 by EV
          limited.sort((a: any, b: any) => b.evResult.net_ev - a.evResult.net_ev);
          processed = limited.slice(0, 200);
      }
      
      // Update Meta stats if available
      setLastScanMeta((prev: any) => {
          if (!prev) return null;
          return {
              ...prev,
              opportunitiesCount: processed.length,
              uniqueCount: uniqueMap.size,
              dedupDropped: json.length - uniqueMap.size
          };
      });

      setData(processed as { item: any, evResult: PaperTradeResult }[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchScan = useCallback(async () => {
      if (scanning) return;
      if (scanMode === 'single') {
          if (!eventFilter) return;
          const tickerInfo = rawTickerData.find(i => i.eventTicker === eventFilter);
          if (tickerInfo && tickerInfo.pairCount === 0) {
              alert(t('No pairs available for this event ticker'));
              setIsAutoScanning(false);
              return;
          }
      }
      
      setScanning(true);
      try {
          const params = new URLSearchParams();
          params.append('mode', scanMode);
          if (scanMode === 'single') {
             params.append('eventTicker', eventFilter);
          } else {
             params.append('maxPairs', maxPairs);
             params.append('shuffle', 'true');
          }

          // Trigger Scan
          const res = await fetch(`/api/scan/batch?${params.toString()}`, { method: 'POST' });
          const json = await res.json();
          console.log("Batch Scan Result:", json);
          
          if (json.meta) {
              setLastScanMeta({
                  ...json.meta,
                  timestamp: new Date().toISOString()
              });
          }

          // Refresh Data
          await fetchData();
      } catch (e) {
          console.error("Batch scan failed", e);
      } finally {
          setScanning(false);
      }
  }, [eventFilter, scanMode, maxPairs, showAll, rawTickerData, scanning]);

  // Auto Scan Effect
  useEffect(() => {
      let timer: NodeJS.Timeout;
      if (isAutoScanning) {
          handleBatchScan(); // Run immediately
          timer = setInterval(handleBatchScan, scanInterval);
      }
      return () => {
          if (timer) clearInterval(timer);
      };
  }, [isAutoScanning, scanInterval, handleBatchScan]);

  // --- Optimized Filtering & Grouping (Memoized) ---
  const { filteredData, filterStats, groupedData } = useMemo(() => {
      const stats = {
          raw: data.length,
          shown: 0,
          filteredOut: 0,
          reasons: {
              onlyTradeable: 0,
              minNetEv: 0,
              depth: 0,
              eventTicker: 0
          }
      };

      const filtered = data.filter(({ item, evResult }) => {
          // 1. Event Filter (Only in Single Mode)
          if (scanMode === 'single' && eventFilter && item.pair?.kh_ticker) {
              if (!item.pair.kh_ticker.startsWith(eventFilter)) {
                  stats.reasons.eventTicker++;
                  return false;
              }
          }

          // 2. Min Net EV
          const minEvVal = parseFloat(minNetEv);
          if (!isNaN(minEvVal) && evResult.net_ev < minEvVal) {
              stats.reasons.minNetEv++;
              return false;
          }

          // 3. Depth Status
          if (!showInsufficientDepth) {
              if (evResult.depthStatus === 'DEPTH_INSUFFICIENT') {
                  stats.reasons.depth++;
                  return false;
              }
          }

          // 4. Tradeable (New Definition)
          if (onlyTradeable) {
              let isTradeable = true;
              if (evResult.net_ev <= 0) isTradeable = false;
              if (evResult.depthStatus !== 'DEPTH_OK') isTradeable = false;
              if (evResult.shares_used <= 0) isTradeable = false;
              if (evResult.sanity_status !== 'OK') isTradeable = false;
              
              if (!isTradeable) {
                  stats.reasons.onlyTradeable++;
                  return false;
              }
          }

          return true;
      });

      stats.shown = filtered.length;
      stats.filteredOut = stats.raw - stats.shown;

      // Sort
      const sorted = [...filtered].sort((a, b) => b.evResult.net_ev - a.evResult.net_ev);

      // Group for 'All' mode
      let groups: Record<string, typeof sorted> = {};
      if (scanMode === 'all') {
          sorted.forEach(d => {
              const ticker = d.item.pair?.kh_ticker || 'Unknown';
              if (!groups[ticker]) groups[ticker] = [];
              groups[ticker].push(d);
          });
      }

      return { 
          filteredData: sorted, 
          filterStats: stats,
          groupedData: groups 
      };

  }, [data, scanMode, eventFilter, minNetEv, showInsufficientDepth, onlyTradeable]);


  // --- Rendering Helper ---
  const renderCard = ({ item, evResult }: { item: any, evResult: PaperTradeResult }) => {
     const pmUrl = buildPolymarketUrl(
         item.debug_info?.pm?.slug, 
         item.debug_info?.pm?.market_id,
         item.pair?.title_pm,
         item.pair?.pm_open_url
     );
     const khUrl = buildKalshiUrl(
         item.debug_info?.kh?.ticker,
         item.pair?.kh_open_url
     );
     
     return (
    <Card key={item.id} className={evResult.tradeable ? 'border-green-500/50' : ''}>
      <CardContent className="pt-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h3 className="font-bold text-lg flex items-center gap-2">
                {item.pair?.title_pm || `${t('Pair #')}${item.pair_id}`}
                <div className="flex gap-1 ml-2">
                    {pmUrl && (
                        <a href={pmUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-700" title={t('Open PM')}>
                            <ExternalLink className="h-4 w-4" />
                        </a>
                    )}
                     {khUrl && (
                        <a href={khUrl} target="_blank" rel="noopener noreferrer" className="text-cyan-600 hover:text-cyan-800" title={t('Open KH')}>
                            <ExternalLink className="h-4 w-4" />
                        </a>
                    )}
                </div>
            </h3>
            {item.pair?.kh_ticker && (
                 <div className="text-xs text-muted-foreground mb-1 font-mono">
                     {item.pair.kh_ticker}
                 </div>
             )}
            <div className="flex flex-wrap gap-2 mt-1">
                 {/* Depth Status Badge */}
                 <Badge variant={evResult.depthStatus === 'DEPTH_OK' ? "default" : "destructive"} className="text-xs px-2 py-0 h-5">
                     {t(evResult.depthStatus)}
                 </Badge>
                 {/* Sanity Badge */}
                 {evResult.sanity_status !== 'OK' && (
                     <Badge variant="destructive" className="text-xs px-2 py-0 h-5">
                         {evResult.sanity_status}
                     </Badge>
                 )}
                 <span className="text-xs text-muted-foreground self-center flex items-center gap-1">
                     {new Date(item.ts).toLocaleString()}
                     {isSnapshotStale(item.ts) ? (
                         <Badge variant="destructive" className="text-[10px] px-1 h-4">STALE</Badge>
                     ) : (
                         <Badge variant="outline" className="text-[10px] px-1 h-4 text-green-600 border-green-600">FRESH</Badge>
                     )}
                 </span>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-6 text-xs px-2" 
                    onClick={(e) => {
                        e.stopPropagation();
                        handleVerifyPair(item.pair_id);
                    }}
                    title={t('Verify Now')}
                >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Verify
                </Button>
            </div>
            {/* Net EV Display */}
            <div className={`font-bold text-xl ${evResult.net_ev > 0 ? 'text-green-600' : 'text-red-500'}`}>
                ${evResult.net_ev.toFixed(2)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
                Shares: {evResult.shares_used}
            </div>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-4 gap-2 mt-4 bg-muted/20 p-3 rounded-lg text-sm">
            <div>
                <div className="font-semibold text-muted-foreground">{t('Gross')}</div>
                <div>${evResult.gross_edge.toFixed(2)}</div>
            </div>
            <div>
                <div className="font-semibold text-muted-foreground">{t('Fees')}</div>
                <div>${evResult.fees_cost.toFixed(2)}</div>
            </div>
            <div>
                <div className="font-semibold text-muted-foreground">{t('Slippage')}</div>
                <div>${evResult.slippage_cost.toFixed(2)}</div>
            </div>
            <div>
                <div className="font-semibold text-muted-foreground">{t('Incentives')}</div>
                <div>${evResult.incentives.toFixed(2)}</div>
            </div>
        </div>

        {/* Legs Detail (Simplified) */}
        <div className="grid grid-cols-2 gap-4 mt-2 p-2 text-xs">
            {evResult.legs.map((leg, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                    <Badge variant="outline" className="h-4 px-1">{leg.role.substring(0,1)}</Badge>
                    <span>{t('BUY')} {leg.outcome} {leg.platform.toUpperCase()} @ {leg.price.toFixed(3)}</span>
                </div>
            ))}
        </div>

      </CardContent>
    </Card>
    );
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      
      {/* Header & Config Status */}
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">{t('Arbitrage Opportunities')}</h1>
            <div className="flex flex-col items-end gap-1">
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/30 px-3 py-1 rounded">
                    <span>{t('Mode')}: <span className="font-mono font-bold text-foreground">{config?.opp_mode || '...'}</span></span>
                    <span className="text-xs">|</span>
                    <span>{t('Threshold')}: <span className="font-mono font-bold text-foreground">{config?.opp_threshold ?? '...'}</span></span>
                </div>
                {/* Enhanced Debug Stats */}
                <div className="text-xs text-muted-foreground flex flex-col items-end font-mono">
                    <div className="flex gap-2">
                         <span>Last Scan: {lastScanMeta?.timestamp ? new Date(lastScanMeta.timestamp).toLocaleTimeString() : '-'}</span>
                         <span>Mode: {lastScanMeta?.scanMode || '-'}</span>
                         <span>Scanned: {lastScanMeta?.scannedPairs || 0}</span>
                    </div>
                    <div className="flex gap-2 text-foreground/80">
                         <span>Raw Opps: {filterStats.raw}</span>
                         <span>Shown: {filterStats.shown}</span>
                         <span className={filterStats.filteredOut > 0 ? "text-amber-500" : ""}>Skipped: {filterStats.filteredOut}</span>
                         <span>Unique: {lastScanMeta?.uniqueCount || 0}</span>
                    </div>
                </div>
            </div>
        </div>

        {/* Controls Toolbar */}
        <Card className="bg-muted/30">
            <CardContent className="p-4 flex flex-wrap gap-4 items-end">
                
                {/* Mode & Event Selector */}
                <div className="flex flex-col gap-2 min-w-[300px]">
                     <Tabs value={scanMode} onValueChange={(v) => setScanMode(v as 'single' | 'all')} className="w-full h-8">
                        <TabsList className="grid w-full grid-cols-2 h-8">
                            <TabsTrigger value="single" className="text-xs">Single</TabsTrigger>
                            <TabsTrigger value="all" className="text-xs">Full Lib</TabsTrigger>
                        </TabsList>
                    </Tabs>
                    
                    {scanMode === 'single' ? (
                         <SearchableSelect 
                            options={eventTickers}
                            value={eventFilter}
                            onChange={setEventFilter}
                            placeholder="Select Event..."
                        />
                    ) : (
                         <div className="flex items-center gap-2 h-10">
                            <span className="text-sm whitespace-nowrap text-muted-foreground">Max:</span>
                            <Input 
                                type="number"
                                value={maxPairs}
                                onChange={(e) => setMaxPairs(e.target.value)}
                                className="w-full"
                                placeholder="200"
                            />
                         </div>
                    )}
                </div>

                {/* Scan Controls (Moved Here) */}
                <div className="flex items-end gap-2 border-l pl-4 border-muted-foreground/20">
                    <div className="space-y-1">
                        <Label>{t('Interval (ms)')}</Label>
                        <Input 
                            type="number" 
                            value={scanInterval} 
                            onChange={(e) => setScanInterval(parseInt(e.target.value))} 
                            className="w-[100px]"
                            min="1000"
                        />
                    </div>
                    <div className="pb-1">
                        <Button 
                            variant={isAutoScanning ? "destructive" : "secondary"}
                            onClick={() => setIsAutoScanning(!isAutoScanning)}
                            className="w-[120px]"
                        >
                            {isAutoScanning ? (
                                <>
                                    <StopCircle className="mr-2 h-4 w-4" />
                                    {t('Stop Auto')}
                                </>
                            ) : (
                                <>
                                    <Play className="mr-2 h-4 w-4" />
                                    {t('Auto Scan')}
                                </>
                            )}
                        </Button>
                    </div>
                    <Button variant="default" onClick={handleBatchScan} disabled={scanning || (scanMode === 'single' && !eventFilter)}>
                        {scanning ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        {scanning ? t('Scanning...') : t('Scan Once')}
                    </Button>
                </div>

                <div className="flex-1"></div>

                {/* Min Net EV */}
                <div className="space-y-1">
                    <Label>{t('Min Net EV ($)')}</Label>
                    <Input 
                        type="number"
                        value={minNetEv}
                        onChange={(e) => setMinNetEv(e.target.value)}
                        className="w-[100px]"
                        step="1"
                    />
                </div>

                {/* Toggles */}
                <div className="flex flex-col gap-2 pb-1">
                    <div className="flex items-center space-x-2">
                        <Switch id="only-tradeable" checked={onlyTradeable} onCheckedChange={setOnlyTradeable} />
                        <Label htmlFor="only-tradeable">{t('Only Tradeable')}</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                        <Switch id="show-depth" checked={showInsufficientDepth} onCheckedChange={setShowInsufficientDepth} />
                        <Label htmlFor="show-depth">{t('Show Insufficient Depth')}</Label>
                    </div>
                </div>
                
                <div className="flex items-center space-x-2 pb-3">
                     <Switch id="show-all" checked={showAll} onCheckedChange={setShowAll} />
                     <Label htmlFor="show-all">{t('Show All Logs')}</Label>
                </div>

                <Button variant="outline" onClick={fetchData} disabled={loading} title={t('Refresh Data')}>
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>

            </CardContent>
        </Card>
      </div>

      {/* Results List */}
      <div className="space-y-4">
        {filterStats.shown === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <div className="flex flex-col items-center gap-3">
                  <AlertCircle className="h-10 w-10 text-muted-foreground" />
                  <div className="text-xl font-semibold text-muted-foreground">{t('No records found')}</div>
                  
                  {/* Explanation Logic */}
                  {filterStats.raw > 0 ? (
                      <div className="text-sm text-muted-foreground max-w-md bg-muted/50 p-4 rounded-md text-left">
                          <p className="font-bold mb-2">Scan found {filterStats.raw} items, but all were filtered:</p>
                          <ul className="list-disc pl-5 space-y-1">
                              {filterStats.reasons.onlyTradeable > 0 && (
                                  <li><span className="font-mono text-foreground">Only Tradeable</span> hidden {filterStats.reasons.onlyTradeable} items</li>
                              )}
                              {filterStats.reasons.minNetEv > 0 && (
                                  <li><span className="font-mono text-foreground">Min Net EV</span> hidden {filterStats.reasons.minNetEv} items</li>
                              )}
                              {filterStats.reasons.depth > 0 && (
                                  <li><span className="font-mono text-foreground">Insufficient Depth</span> hidden {filterStats.reasons.depth} items</li>
                              )}
                              {filterStats.reasons.eventTicker > 0 && (
                                  <li><span className="font-mono text-foreground">Event Ticker Mismatch</span> hidden {filterStats.reasons.eventTicker} items</li>
                              )}
                          </ul>
                          <p className="mt-3 text-xs italic opacity-80">Try disabling "Only Tradeable" or lowering "Min Net EV".</p>
                      </div>
                  ) : (
                      <div className="text-sm text-muted-foreground">
                          {scanMode === 'single' ? "No opportunities returned from API for this event." : "No opportunities found in full library scan."}
                      </div>
                  )}
              </div>
            </CardContent>
          </Card>
        ) : scanMode === 'all' ? (
           // Render Grouped
           Object.entries(groupedData).map(([ticker, items]) => (
               <TickerGroup 
                   key={ticker} 
                   ticker={ticker} 
                   items={items} 
                   renderItem={(item) => renderCard(item as any)}
                   limit={showAll ? 50 : 20}
               />
           ))
        ) : (
          // Render Flat
          <div className="grid gap-4">
            {filteredData.map(renderCard)}
          </div>
        )}
      </div>
    </div>
  );
}
