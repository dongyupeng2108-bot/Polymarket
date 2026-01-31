
'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RefreshCw, ArrowRight, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { calculateSlippage, evaluateKalshiEdge, OrderBook } from '@/lib/utils/orderbook-math';
import { useI18n } from '@/lib/i18n/context';

const DEFAULT_TICKER = 'KXFEDCHAIRNOM-29-KW';

export function KalshiPanel() {
  const { t } = useI18n();
  const [ticker, setTicker] = useState(DEFAULT_TICKER);
  const [targetSize, setTargetSize] = useState<number>(1000);
  const [competitorPrice, setCompetitorPrice] = useState<number>(0.50);
  
  const [orderbook, setOrderbook] = useState<OrderBook | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchOrderbook = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/debug/kh/orderbook?ticker=${ticker}`);
      const data = await res.json();
      
      if (res.ok && data.final?.ok) {
        setOrderbook(data.parsed_book);
        setLastUpdated(new Date());
      } else {
        setError(data.error || data.final?.error_message || 'Failed to fetch');
        setOrderbook(null);
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
      setOrderbook(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderbook();
  }, []); // Initial fetch

  // Calculations
  const bestBid = orderbook?.bids[0]?.price || 0;
  const bestAsk = orderbook?.asks[0]?.price || 0;
  const mid = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;

  const buySlippage = orderbook ? calculateSlippage('buy', targetSize, orderbook) : null;
  const sellSlippage = orderbook ? calculateSlippage('sell', targetSize, orderbook) : null;
  
  const edgeResult = orderbook ? evaluateKalshiEdge(competitorPrice, targetSize, 0, orderbook) : null;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{t('Kalshi Market Analyzer')}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {lastUpdated ? `${t('Updated')}: ${lastUpdated.toLocaleTimeString()}` : t('No Data')}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('Ticker')}</label>
            <div className="flex gap-2">
              <Input 
                value={ticker} 
                onChange={(e) => setTicker(e.target.value)} 
                placeholder={t('Ticker')}
                className="h-8"
              />
              <Button size="sm" variant="outline" onClick={fetchOrderbook} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('Target Size (Shares)')}</label>
            <Input 
              type="number" 
              value={targetSize} 
              onChange={(e) => setTargetSize(Number(e.target.value))} 
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('Competitor Price (0-1)')}</label>
            <Input 
              type="number" 
              step="0.01"
              value={competitorPrice} 
              onChange={(e) => setCompetitorPrice(Number(e.target.value))} 
              className="h-8"
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-md flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {orderbook && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 1. Market Stats & Orderbook */}
            <div className="col-span-1 space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-slate-50 p-2 rounded">
                  <div className="text-muted-foreground text-xs">{t('Best Bid (Sell YES)')}</div>
                  <div className="font-mono font-bold text-green-600">{bestBid.toFixed(2)}</div>
                </div>
                <div className="bg-slate-50 p-2 rounded">
                  <div className="text-muted-foreground text-xs">{t('Best Ask (Buy YES)')}</div>
                  <div className="font-mono font-bold text-red-600">{bestAsk.toFixed(2)}</div>
                </div>
                <div className="bg-slate-50 p-2 rounded">
                  <div className="text-muted-foreground text-xs">{t('Mid Price')}</div>
                  <div className="font-mono">{mid.toFixed(3)}</div>
                </div>
                <div className="bg-slate-50 p-2 rounded">
                  <div className="text-muted-foreground text-xs">{t('Spread')}</div>
                  <div className="font-mono">{spread.toFixed(2)}</div>
                </div>
              </div>

              {/* Mini Orderbook */}
              <div className="border rounded-md overflow-hidden text-xs">
                <div className="grid grid-cols-3 bg-slate-100 p-1 font-medium text-center">
                  <div>{t('Bid Size')}</div>
                  <div>{t('Price')}</div>
                  <div>{t('Ask Size')}</div>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                   {Array.from({ length: 20 }).map((_, i) => {
                     const bid = orderbook.bids[i];
                     const ask = orderbook.asks[i];
                     if (!bid && !ask) return null;
                     return (
                       <div key={i} className="grid grid-cols-3 border-t hover:bg-slate-50 text-center py-0.5">
                         <div className="text-green-600 font-mono">{bid ? bid.size : '-'}</div>
                         <div className="flex justify-center gap-2 font-mono font-bold">
                           <span className="text-green-600">{bid ? bid.price.toFixed(2) : '   '}</span>
                           <span className="text-gray-300">|</span>
                           <span className="text-red-600">{ask ? ask.price.toFixed(2) : '   '}</span>
                         </div>
                         <div className="text-red-600 font-mono">{ask ? ask.size : '-'}</div>
                       </div>
                     );
                   })}
                </div>
              </div>
            </div>

            {/* 2. Slippage Analysis */}
            <div className="col-span-1 space-y-4 border-l pl-6">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <ArrowRight className="h-4 w-4" /> {t('Execution')} ({t('Size')}: {targetSize})
              </h3>
              
              {/* Buy Analysis */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase">{t('Buying YES (Hitting Asks)')}</div>
                <div className="grid grid-cols-2 gap-2 text-sm bg-red-50 p-3 rounded-md">
                   <div>
                      <span className="text-xs text-muted-foreground block">{t('VWAP')}</span>
                      <span className="font-mono font-bold">{buySlippage?.vwap.toFixed(4)}</span>
                   </div>
                   <div>
                      <span className="text-xs text-muted-foreground block">{t('Cost')}</span>
                      <span className="font-mono">${buySlippage?.cost.toFixed(2)}</span>
                   </div>
                   <div>
                      <span className="text-xs text-muted-foreground block">{t('Filled')}</span>
                      <span className="font-mono">{buySlippage?.filledSize} / {targetSize}</span>
                   </div>
                   <div>
                      <span className="text-xs text-muted-foreground block">{t('Depth')}</span>
                      <span className="font-mono">{buySlippage?.levelsConsumed} lvls</span>
                   </div>
                </div>
              </div>

              {/* Sell Analysis */}
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase">{t('Selling YES (Hitting Bids)')}</div>
                <div className="grid grid-cols-2 gap-2 text-sm bg-green-50 p-3 rounded-md">
                   <div>
                      <span className="text-xs text-muted-foreground block">{t('VWAP')}</span>
                      <span className="font-mono font-bold">{sellSlippage?.vwap.toFixed(4)}</span>
                   </div>
                   <div>
                      <span className="text-xs text-muted-foreground block">{t('Proceeds')}</span>
                      <span className="font-mono">${sellSlippage?.cost.toFixed(2)}</span>
                   </div>
                   <div>
                      <span className="text-xs text-muted-foreground block">{t('Filled')}</span>
                      <span className="font-mono">{sellSlippage?.filledSize} / {targetSize}</span>
                   </div>
                   <div>
                      <span className="text-xs text-muted-foreground block">{t('Depth')}</span>
                      <span className="font-mono">{sellSlippage?.levelsConsumed} lvls</span>
                   </div>
                </div>
              </div>
            </div>

            {/* 3. Arbitrage Eval */}
            <div className="col-span-1 space-y-4 border-l pl-6">
               <h3 className="font-semibold text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> {t('Arbitrage Opportunity')}
              </h3>
              
              <div className="p-4 bg-slate-50 rounded-lg border">
                <div className="text-xs text-muted-foreground mb-2">{t('Vs Competitor Price')}: {competitorPrice}</div>
                
                {edgeResult?.direction === 'none' ? (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    {t('No immediate arbitrage opportunity found.')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-lg font-bold">
                       {edgeResult?.direction === 'buy' ? (
                         <span className="text-green-600 flex items-center gap-1">
                           <TrendingUp className="h-5 w-5" /> {t('BUY Kalshi')}
                         </span>
                       ) : (
                         <span className="text-red-600 flex items-center gap-1">
                           <TrendingDown className="h-5 w-5" /> {t('SELL Kalshi')}
                         </span>
                       )}
                    </div>
                    
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('Gross Edge')}:</span>
                        <span className={`font-mono font-bold ${edgeResult && edgeResult.grossEdge > 0 ? 'text-green-600' : ''}`}>
                          {(edgeResult?.grossEdge || 0).toFixed(4)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('Kalshi VWAP')}:</span>
                        <span className="font-mono">{(edgeResult?.vwap || 0).toFixed(4)}</span>
                      </div>
                       <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('Max Size')}:</span>
                        <span className="font-mono">{edgeResult?.maxSize}</span>
                      </div>
                    </div>

                    <div className="text-xs text-muted-foreground mt-2 pt-2 border-t">
                      {t('* Assumes 0 fees. Execution risk applies.')}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
