'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/context';
import { BookOpen, Calculator, Info, AlertTriangle } from 'lucide-react';

interface Config {
  sim: {
    notional: number;
    fee_rate_pm: number;
    fee_rate_kh: number;
    slippage_bps: number;
    latency_penalty_bps_per_100ms: number;
  };
}

export default function TradeExplanationPage() {
  const { t } = useI18n();
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setConfig(data))
      .catch(err => console.error('Failed to load config', err));
  }, []);

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BookOpen className="h-8 w-8 text-emerald-500" />
        <h1 className="text-3xl font-bold">{t('Trade Explanation')}</h1>
      </div>

      {/* Disclaimer */}
      <div className="bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 shrink-0" />
        <div>
            <h3 className="font-bold text-yellow-500 mb-1">{t('Disclaimer')}</h3>
            <p className="text-yellow-200/80 text-sm">
                {t('Disclaimer Text')}
            </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Cost Structure */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              {t('Cost Explanation')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-800/50">
                        <tr>
                            <th className="px-4 py-3 rounded-tl-lg">{t('Variable')}</th>
                            <th className="px-4 py-3">{t('Description')}</th>
                            <th className="px-4 py-3 rounded-tr-lg text-right">{t('Current Value')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        <tr className="bg-gray-900/50">
                            <td className="px-4 py-3 font-medium text-emerald-400">SIM_NOTIONAL</td>
                            <td className="px-4 py-3 text-gray-400">{t('Notional Amount')}</td>
                            <td className="px-4 py-3 text-right font-mono">${config?.sim.notional ?? '...'}</td>
                        </tr>
                        <tr>
                            <td className="px-4 py-3 font-medium text-blue-400">SIM_FEE_RATE_PM</td>
                            <td className="px-4 py-3 text-gray-400">{t('PM Fee Rate')}</td>
                            <td className="px-4 py-3 text-right font-mono">{(config?.sim.fee_rate_pm ?? 0) * 100}%</td>
                        </tr>
                        <tr className="bg-gray-900/50">
                            <td className="px-4 py-3 font-medium text-purple-400">SIM_FEE_RATE_KH</td>
                            <td className="px-4 py-3 text-gray-400">{t('KH Fee Rate')}</td>
                            <td className="px-4 py-3 text-right font-mono">{(config?.sim.fee_rate_kh ?? 0) * 100}%</td>
                        </tr>
                        <tr>
                            <td className="px-4 py-3 font-medium text-orange-400">SIM_SLIPPAGE_BPS</td>
                            <td className="px-4 py-3 text-gray-400">{t('Slippage')}</td>
                            <td className="px-4 py-3 text-right font-mono">{config?.sim.slippage_bps ?? '...'} bps</td>
                        </tr>
                        <tr className="bg-gray-900/50">
                            <td className="px-4 py-3 font-medium text-red-400">SIM_LATENCY_PENALTY</td>
                            <td className="px-4 py-3 text-gray-400">{t('Latency Penalty')} (bps/100ms)</td>
                            <td className="px-4 py-3 text-right font-mono">{config?.sim.latency_penalty_bps_per_100ms ?? '...'} bps</td>
                        </tr>
                    </tbody>
                </table>
            </div>
          </CardContent>
        </Card>

        {/* Formula */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              {t('Calculation Formula')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 bg-gray-900 rounded-lg border border-gray-800 font-mono text-sm text-gray-300 break-all">
                {t('Profit Formula')}
            </div>
            
            <div className="space-y-2 text-sm text-gray-400">
                <p><span className="text-emerald-400 font-bold">{t('Quantity')}</span> = SIM_NOTIONAL / {t('Buy Price')}</p>
                <p><span className="text-blue-400 font-bold">{t('Fees')}</span> = {t('Quantity')} * ({t('Buy Price')} * Fee_Buy + {t('Sell Price')} * Fee_Sell)</p>
                <p><span className="text-orange-400 font-bold">{t('Slippage')}</span> = {t('Quantity')} * {t('Buy Price')} * (SIM_SLIPPAGE_BPS / 10000)</p>
                <p><span className="text-red-400 font-bold">{t('Latency Penalty')}</span> = {t('Quantity')} * {t('Buy Price')} * (Latency_Diff / 100) * (PENALTY_BPS / 10000)</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
