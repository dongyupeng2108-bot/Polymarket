'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, Settings2 } from 'lucide-react';
import { calculatePaperTrade, PaperTradeConfig, PaperTradeResult, PlatformConfig } from '@/lib/sim/paperTradingModel';
import { ScanResult } from '@/lib/services/scanner';
import { useI18n } from '@/lib/i18n/context';

// --- Stats Interface ---
interface AggregatedStats {
    count: number;
    totalProfit: number;
    totalFees: number;
    totalIncentives: number;
    totalSlippage: number;
    totalEV: number;
    p50_ev: number;
    p90_ev: number;
    avg_ev: number;
    p5_ev: number; // Tail risk
}

export default function PaperTradingPage() {
    const { t } = useI18n();
    // --- Config State ---
    const [virtualFund, setVirtualFund] = useState(10000);
    const [eventTicker, setEventFilter] = useState('KXFEDCHAIRNOM-29');
    
    // Platform Configs (Now using makerIncentivePerShare)
    const [pmConfig, setPmConfig] = useState<Omit<PlatformConfig, 'id'>>({
        makerFeeRate: 0,
        takerFeeRate: 0.1, // 0.1%
        makerIncentivePerShare: 0, // $0
        slippageModel: { enabled: true, useDepth: true, fixedBps: 10 }
    });

    const [khConfig, setKhConfig] = useState<Omit<PlatformConfig, 'id'>>({
        makerFeeRate: 0,
        takerFeeRate: 0.1,
        makerIncentivePerShare: 0, // $0
        slippageModel: { enabled: true, useDepth: true, fixedBps: 10 }
    });

    // Filters
    const [showInsufficientDepth, setShowInsufficientDepth] = useState(false);

    // --- Data State ---
    const [loading, setLoading] = useState(false);
    const [resultsMT, setResultsMT] = useState<PaperTradeResult[]>([]);
    const [resultsMM, setResultsMM] = useState<PaperTradeResult[]>([]);
    const [resultsTT, setResultsTT] = useState<PaperTradeResult[]>([]);
    
    // Stats
    const [statsMT, setStatsMT] = useState<AggregatedStats | null>(null);
    const [statsMM, setStatsMM] = useState<AggregatedStats | null>(null);
    const [statsTT, setStatsTT] = useState<AggregatedStats | null>(null);

    // --- Actions ---
    const runSimulation = async () => {
        setLoading(true);
        try {
            // 1. Fetch Live Data
            const res = await fetch(`/api/scan/batch?eventTicker=${eventTicker}&limit=100&min_edge=-1`, { method: 'POST' });
            const data = await res.json();
            const rawItems: ScanResult[] = data.results || [];

            // 2. Prepare Config
            const fullConfig: PaperTradeConfig = {
                virtualFund,
                platforms: {
                    'pm': { id: 'pm', ...pmConfig },
                    'kh': { id: 'kh', ...khConfig }
                }
            };

            // 3. Run Models for all modes
            const validItems = rawItems.filter(i => i.simulation?.direction && i.simulation.direction !== 'NONE');
            
            const rMT = validItems.map(item => calculatePaperTrade(item, fullConfig, 'MakerTaker'));
            const rMM = validItems.map(item => calculatePaperTrade(item, fullConfig, 'MakerMaker'));
            const rTT = validItems.map(item => calculatePaperTrade(item, fullConfig, 'TakerTaker'));

            setResultsMT(rMT);
            setResultsMM(rMM);
            setResultsTT(rTT);

            // 4. Aggregate Stats (using all valid items, filters apply to list view)
            setStatsMT(aggregateStats(rMT));
            setStatsMM(aggregateStats(rMM));
            setStatsTT(aggregateStats(rTT));

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const aggregateStats = (results: PaperTradeResult[]): AggregatedStats => {
        // Stats typically should reflect "Tradeable" opportunities under the current model
        // Filter for NetEV > 0 && Depth OK && Sanity OK
        
        const valid = results.filter(r => r.net_ev > 0 && r.depthStatus === 'DEPTH_OK' && r.sanity_status === 'OK');
        
        let totalProfit = 0;
        let totalFees = 0;
        let totalIncentives = 0;
        let totalSlippage = 0;
        const evs: number[] = [];

        valid.forEach(r => {
            totalProfit += r.net_profit;
            totalFees += r.fees_cost;
            totalIncentives += r.incentives;
            totalSlippage += r.slippage_cost;
            evs.push(r.net_profit);
        });

        evs.sort((a, b) => a - b);
        const p50 = evs.length ? evs[Math.floor(evs.length * 0.5)] : 0;
        const p90 = evs.length ? evs[Math.floor(evs.length * 0.9)] : 0;
        const p5 = evs.length ? evs[Math.floor(evs.length * 0.05)] : 0;
        const avg = evs.length ? totalProfit / evs.length : 0;

        return {
            count: valid.length,
            totalProfit,
            totalFees,
            totalIncentives,
            totalSlippage,
            totalEV: totalProfit,
            p50_ev: p50,
            p90_ev: p90,
            avg_ev: avg,
            p5_ev: p5
        };
    };

    // --- Render Helpers ---
    const renderStatCard = (title: string, stats: AggregatedStats | null, badge?: string) => (
        <Card className="flex-1">
            <CardHeader className="pb-2">
                <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
                    {badge && <Badge variant="outline">{badge}</Badge>}
                </div>
                <div className="text-2xl font-bold">
                    ${stats?.totalEV.toFixed(2) ?? '0.00'}
                </div>
                <CardDescription>{t('Total Net EV')} ({stats?.count ?? 0} {t('trades')})</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>{t('Avg / Trade')}:</span> <span>${stats?.avg_ev.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>P50:</span> <span>${stats?.p50_ev.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>P90:</span> <span>${stats?.p90_ev.toFixed(2)}</span></div>
                    <div className="border-t pt-1 mt-1">
                        <div className="flex justify-between"><span>{t('Fees')}:</span> <span className="text-red-500">-${stats?.totalFees.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>{t('Slippage')}:</span> <span className="text-red-500">-${stats?.totalSlippage.toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>{t('Incentives')}:</span> <span className="text-green-500">+${stats?.totalIncentives.toFixed(2)}</span></div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    const renderTable = (results: PaperTradeResult[]) => {
        // Filter Logic
        const filtered = results.filter(r => {
            if (!showInsufficientDepth && r.depthStatus !== 'DEPTH_OK') return false;
            if (r.net_ev <= 0) return false; // Default hide negative EV? User said "Default NetEV>0"
            return true;
        });

        if (filtered.length === 0) return <div className="p-8 text-center text-muted-foreground">{t('No opportunities match filters.')}</div>;

        return (
            <div className="rounded-md border">
                <div className="p-4 space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b text-xs font-medium text-muted-foreground">
                        <div className="w-1/3">{t('Legs (Role)')}</div>
                        <div className="w-1/6 text-right">{t('Net EV')}</div>
                        <div className="w-1/6 text-right">{t('Fees')}</div>
                        <div className="w-1/6 text-right">{t('Slippage')}</div>
                        <div className="w-1/6 text-right">{t('Incentives')}</div>
                    </div>
                    {filtered.map((r, i) => (
                        <div key={i} className="flex justify-between items-center py-2 border-b last:border-0 text-sm">
                            <div className="w-1/3 flex flex-col">
                                {r.legs.map((leg, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <Badge variant={leg.role === 'MAKER' ? 'secondary' : 'outline'} className="text-[10px] px-1 py-0 h-4">
                                            {leg.role.substring(0, 1)}
                                        </Badge>
                                        <span className="text-xs">{t('BUY')} {leg.outcome} {leg.platform.toUpperCase()} @ {leg.price.toFixed(3)}</span>
                                    </div>
                                ))}
                                <div className="text-[10px] font-semibold text-muted-foreground mt-0.5 ml-8">
                                    YES+NO = {r.total_cost_per_share.toFixed(4)}
                                </div>

                                {r.depthStatus !== 'DEPTH_OK' && (
                                    <span className="text-[10px] text-red-500 mt-1 font-semibold">⚠ {t('DEPTH_INSUFFICIENT').toUpperCase()}</span>
                                )}
                                {r.sanity_status !== 'OK' && (
                                    <Badge variant="destructive" className="mt-1 w-fit text-[10px] h-5">BUG SUSPECT</Badge>
                                )}
                                
                                <div className="mt-2 text-[10px] text-muted-foreground grid grid-cols-2 gap-x-2 gap-y-0.5 bg-muted/30 p-1.5 rounded border border-muted/50">
                                    <div title="Shares Used">{t('Shares Used')}: {r.shares_used.toFixed(0)}</div>
                                    <div title="Total Capital Locked">{t('Total Capital Locked')}: ${r.total_required_capital.toFixed(0)}</div>
                                    <div title="Buy YES Notional">{t('Buy YES Notional')}: ${r.buy_notional.toFixed(0)}</div>
                                    <div title="Buy NO Notional">{t('Buy NO Notional')}: ${r.sell_notional.toFixed(0)}</div>
                                    <div title="Net Profit per Share">{t('Net Profit per Share')}: ${r.net_per_share.toFixed(4)}</div>
                                    <div title="Gross Profit per Share">{t('Gross Profit per Share')}: ${r.gross_per_share.toFixed(4)}</div>
                                </div>
                            </div>
                            <div className="w-1/6 text-right font-bold text-green-600">
                                ${r.net_ev.toFixed(2)}
                            </div>
                            <div className="w-1/6 text-right text-red-500 text-xs">
                                -${r.fees_cost.toFixed(2)}
                            </div>
                            <div className="w-1/6 text-right text-red-500 text-xs">
                                <div className="flex flex-col">
                                    <span>-${r.slippage_cost.toFixed(2)}</span>
                                    <span className="text-[10px] text-muted-foreground">(${r.legs.reduce((acc, l) => acc + l.slippagePerShare, 0).toFixed(4)}/sh)</span>
                                </div>
                            </div>
                            <div className="w-1/6 text-right text-green-500 text-xs">
                                +${r.incentives.toFixed(2)}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6 p-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">{t('Paper Trading Page Title')}</h2>
                    <p className="text-muted-foreground">{t('Virtual execution simulation & cost modeling')}</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={runSimulation} disabled={loading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        {t('Refresh Data')}
                    </Button>
                </div>
            </div>

            {/* Configuration Panel */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Settings2 className="h-5 w-5" />
                        <CardTitle>{t('Simulation Configuration')}</CardTitle>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-6 md:grid-cols-3">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>{t('Virtual Fund ($)')}</Label>
                            <Input type="number" value={virtualFund} onChange={(e) => setVirtualFund(parseFloat(e.target.value))} />
                        </div>
                        <div className="space-y-2">
                            <Label>{t('Event Filter')}</Label>
                            <Input value={eventTicker} onChange={(e) => setEventFilter(e.target.value)} />
                        </div>
                    </div>

                    <div className="space-y-4 border-l pl-4">
                        <h4 className="font-semibold flex items-center gap-2">Polymarket {t('Configuration')}</h4>
                        <div className="grid grid-cols-2 gap-2">
                            <div><Label className="text-xs">{t('Maker Fee (%)')}</Label><Input type="number" step="0.01" value={pmConfig.makerFeeRate} onChange={e => setPmConfig({...pmConfig, makerFeeRate: parseFloat(e.target.value)})} /></div>
                            <div><Label className="text-xs">{t('Taker Fee (%)')}</Label><Input type="number" step="0.01" value={pmConfig.takerFeeRate} onChange={e => setPmConfig({...pmConfig, takerFeeRate: parseFloat(e.target.value)})} /></div>
                            <div className="col-span-2"><Label className="text-xs">{t('Maker Incentive ($/share)')}</Label><Input type="number" step="0.001" value={pmConfig.makerIncentivePerShare} onChange={e => setPmConfig({...pmConfig, makerIncentivePerShare: parseFloat(e.target.value)})} /></div>
                        </div>
                    </div>

                    <div className="space-y-4 border-l pl-4">
                        <h4 className="font-semibold flex items-center gap-2">Kalshi {t('Configuration')}</h4>
                        <div className="grid grid-cols-2 gap-2">
                            <div><Label className="text-xs">{t('Maker Fee (%)')}</Label><Input type="number" step="0.01" value={khConfig.makerFeeRate} onChange={e => setKhConfig({...khConfig, makerFeeRate: parseFloat(e.target.value)})} /></div>
                            <div><Label className="text-xs">{t('Taker Fee (%)')}</Label><Input type="number" step="0.01" value={khConfig.takerFeeRate} onChange={e => setKhConfig({...khConfig, takerFeeRate: parseFloat(e.target.value)})} /></div>
                            <div className="col-span-2"><Label className="text-xs">{t('Maker Incentive ($/share)')}</Label><Input type="number" step="0.001" value={khConfig.makerIncentivePerShare} onChange={e => setKhConfig({...khConfig, makerIncentivePerShare: parseFloat(e.target.value)})} /></div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Stats Overview */}
            <div className="flex flex-col md:flex-row gap-4">
                {renderStatCard(t("Maker-Taker (P0)"), statsMT, t("Recommended"))}
                {renderStatCard(t("Maker-Maker (P1)"), statsMM)}
                {renderStatCard(t("Taker-Taker (P2)"), statsTT)}
            </div>

            {/* Detailed Results */}
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-semibold">{t('Opportunity Details')}</h3>
                    <div className="flex items-center gap-2">
                         <Switch id="show-depth" checked={showInsufficientDepth} onCheckedChange={setShowInsufficientDepth} />
                         <Label htmlFor="show-depth" className="text-sm">{t('Show Insufficient Depth')}</Label>
                    </div>
                </div>

                <Tabs defaultValue="mt" className="w-full">
                    <TabsList>
                        <TabsTrigger value="mt">{t('Maker-Taker (P0)')}</TabsTrigger>
                        <TabsTrigger value="mm">{t('Maker-Maker (P1)')}</TabsTrigger>
                        <TabsTrigger value="tt">{t('Taker-Taker (P2)')}</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="mt">{renderTable(resultsMT)}</TabsContent>
                    <TabsContent value="mm">{renderTable(resultsMM)}</TabsContent>
                    <TabsContent value="tt">{renderTable(resultsTT)}</TabsContent>
                </Tabs>
            </div>
        </div>
    );
}
