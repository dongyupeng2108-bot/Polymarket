
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from "@/components/ui/button"
import { useI18n } from '@/lib/i18n/context';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RefreshCw, Play, Square, AlertCircle, BarChart3, List, Network, Activity } from 'lucide-react';
import Link from 'next/link';


export default function SettingsPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState<any>(null);
  const [networkHealth, setNetworkHealth] = useState<any>(null);
  const [betfairHealth, setBetfairHealth] = useState<any>(null);
  const [checkingNetwork, setCheckingNetwork] = useState(false);
  const [config, setConfig] = useState<any>({
    poll_interval_sec: 15,
    qty_default: 100,
    min_edge_pct: 0.01,
    min_profit_usd: 5,
    fee_pm: 0,
    fee_kh: 0,
    misc_cost_per_trade_usd: 0
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/tasks/status');
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchNetworkHealth = async () => {
    setCheckingNetwork(true);
    try {
      const [resNet, resBf] = await Promise.all([
        fetch('/api/health/network'),
        fetch('/api/health/betfair')
      ]);
      
      const dataNet = await resNet.json();
      const dataBf = await resBf.json();
      
      setNetworkHealth(dataNet);
      setBetfairHealth(dataBf);
    } catch (e) {
      console.error(e);
    } finally {
      setCheckingNetwork(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data && data.id) setConfig(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchConfig();
    fetchNetworkHealth(); // Initial check
    const timer = setInterval(() => {
        fetchStatus();
        // Don't auto-poll network health too aggressively to avoid noise, 
        // or poll it but maybe less frequent? User didn't specify auto-poll.
        // But previously we polled every 3s. Let's poll status every 3s.
        // Maybe network health every 15s or just manual?
        // User said "Run Network Check" button, implying manual control is important.
        // But for dashboard, auto update is nice. I'll keep it manual + initial.
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const handleStart = async () => {
    setLoading(true);
    await fetch('/api/tasks/start', { method: 'POST' });
    await fetchStatus();
    setLoading(false);
  };

  const handleStop = async () => {
    setLoading(true);
    await fetch('/api/tasks/stop', { method: 'POST' });
    await fetchStatus();
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    await fetch('/api/settings', {
      method: 'POST',
      body: JSON.stringify(config)
    });
    setSaving(false);
  };

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{t('System Settings & Status')}</h1>
        <div className="flex gap-2">
            <Link href="/opportunities">
                <Button variant="outline">
                    <List className="mr-2 h-4 w-4" /> {t('View Opportunities')}
                </Button>
            </Link>
            <Button variant="outline" onClick={() => { fetchStatus(); fetchConfig(); fetchNetworkHealth(); }}>
              <RefreshCw className="mr-2 h-4 w-4" /> {t('Refresh')}
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              {t('Scanner Status')}
              {status?.running ? (
                <Badge variant="default" className="bg-green-500">{t('Running')}</Badge>
              ) : (
                <Badge variant="secondary">{t('Stopped')}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('Last Scan')}</p>
                <p className="font-medium">
                  {status?.last_scan_at ? new Date(status.last_scan_at).toLocaleString() : t('Never')}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('Pairs Scanned')}</p>
                <p className="font-medium">{status?.pairs_scanned || 0}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('Polymarket Health')}</p>
                <div className="flex gap-2">
                  <span className="text-green-600 font-bold">{status?.pm_ok_count || 0} OK</span>
                  <span className="text-red-500 font-bold">{status?.pm_fail_count || 0} {t('Fail')}</span>
                </div>
              </div>
              {/* Removed misleading Kalshi Health stats */}
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('Total Evaluations')}</p>
                <p className="font-medium">{status?.eval_count || 0}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{t('Opportunities Found')}</p>
                <p className="font-medium text-green-600">{status?.opportunity_count || 0}</p>
              </div>
            </div>

            {status?.last_error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>{t('Last Error')}</AlertTitle>
                <AlertDescription className="break-all text-xs font-mono">
                  {status.last_error}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-4 pt-4">
              <Button 
                onClick={handleStart} 
                disabled={loading || status?.running} 
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <Play className="mr-2 h-4 w-4" /> {t('Start Scanner')}
              </Button>
              <Button 
                onClick={handleStop} 
                disabled={loading || !status?.running} 
                variant="destructive"
                className="flex-1"
              >
                <Square className="mr-2 h-4 w-4" /> {t('Stop Scanner')}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Network Health Card */}
        <Card>
            <CardHeader>
                <CardTitle className="flex justify-between items-center">
                    <div>
                        <Activity className="inline-block mr-2 h-5 w-5" />
                        {t('Network Health')}
                    </div>
                    {networkHealth && (
                        <Badge variant={networkHealth.kalshi_status === 'OK' ? 'default' : (networkHealth.kalshi_status === 'SLOW' ? 'secondary' : 'destructive')} 
                               className={networkHealth.kalshi_status === 'OK' ? 'bg-green-500' : (networkHealth.kalshi_status === 'SLOW' ? 'bg-yellow-500' : '')}>
                            {networkHealth.kalshi_status}
                        </Badge>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                {networkHealth ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <p className="text-muted-foreground">{t('Reason')}</p>
                                <p className="font-mono font-bold">{networkHealth.reason}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">{t('Latency')}</p>
                                <p className="font-mono">{networkHealth.latency_ms} ms</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">{t('HTTP Status')}</p>
                                <p className="font-mono">{networkHealth.http_status || 'N/A'}</p>
                            </div>
                            <div>
                                <p className="text-muted-foreground">{t('Checked At')}</p>
                                <p className="font-mono text-xs">{new Date(networkHealth.checked_at).toLocaleTimeString()}</p>
                            </div>
                        </div>
                        
                        {(networkHealth.error_code || networkHealth.error_message) && (
                            <div className="p-2 bg-red-50 rounded border border-red-200 text-xs text-red-700 font-mono break-all">
                                {networkHealth.stage && <span className="font-bold">[{networkHealth.stage.toUpperCase()}] </span>}
                                {networkHealth.error_code} {networkHealth.error_message}
                            </div>
                        )}
                        
                        <div className="text-xs text-muted-foreground break-all">
                            Target: {networkHealth.url_used}
                        </div>
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground py-4">
                        {t('Status unknown. Run check.')}
                    </div>
                )}

                {/* Betfair Health Section */}
                {betfairHealth && (
                  <div className="mt-4 pt-4 border-t border-gray-800">
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      {t('Betfair Status')}
                      <Badge variant={betfairHealth.status === 'ok' ? 'default' : (betfairHealth.error_reason === 'missing_credentials' ? 'secondary' : 'destructive')} 
                             className={betfairHealth.status === 'ok' ? 'bg-green-500' : (betfairHealth.error_reason === 'missing_credentials' ? 'bg-yellow-500 hover:bg-yellow-600' : '')}>
                        {betfairHealth.status === 'ok' ? 'OK' : (betfairHealth.error_reason === 'missing_credentials' ? t('Not Configured') : 'Error')}
                      </Badge>
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <p className="text-muted-foreground">{t('Latency')}</p>
                            <p className="font-mono">{betfairHealth.latency} ms</p>
                        </div>
                        <div>
                            <p className="text-muted-foreground">{t('HTTP Status')}</p>
                            <p className="font-mono">{betfairHealth.http_status || 'N/A'}</p>
                        </div>
                        {betfairHealth.error_reason && (
                            <div className="col-span-2">
                                <p className="text-muted-foreground">{t('Reason')}</p>
                                <p className={`font-mono ${betfairHealth.error_reason === 'missing_credentials' ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-500'}`}>
                                    {t(betfairHealth.error_reason) || betfairHealth.error_reason}
                                </p>
                            </div>
                        )}
                    </div>
                  </div>
                )}
                
                <Button onClick={fetchNetworkHealth} disabled={checkingNetwork} variant="outline" className="w-full">
                    <RefreshCw className={`mr-2 h-4 w-4 ${checkingNetwork ? 'animate-spin' : ''}`} />
                    {t('Run Network Check')}
                </Button>
            </CardContent>
        </Card>

        {/* Configuration Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t('Configuration')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('Default Qty')}</Label>
                <Input 
                  type="number" 
                  value={config.qty_default} 
                  onChange={e => setConfig({...config, qty_default: Number(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('Min Edge (%)')}</Label>
                <Input 
                  type="number" step="0.01"
                  value={config.min_edge_pct} 
                  onChange={e => setConfig({...config, min_edge_pct: Number(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('Min Profit ($)')}</Label>
                <Input 
                  type="number" step="0.1"
                  value={config.min_profit_usd} 
                  onChange={e => setConfig({...config, min_profit_usd: Number(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('Fee PM (%)')}</Label>
                <Input 
                  type="number" step="0.001"
                  value={config.fee_pm} 
                  onChange={e => setConfig({...config, fee_pm: Number(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('Fee KH (%)')}</Label>
                <Input 
                  type="number" step="0.001"
                  value={config.fee_kh} 
                  onChange={e => setConfig({...config, fee_kh: Number(e.target.value)})}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('Misc Cost ($)')}</Label>
                <Input 
                  type="number" step="0.01"
                  value={config.misc_cost_per_trade_usd} 
                  onChange={e => setConfig({...config, misc_cost_per_trade_usd: Number(e.target.value)})}
                />
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full">
              {saving ? t('Saving...') : t('Save Configuration')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
