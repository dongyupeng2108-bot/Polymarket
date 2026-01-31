'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertTriangle, CheckCircle, DollarSign, Clock } from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';

interface LastOppsScan {
  run_id: number;
  completed_at: string;
  opportunities_total: number;
  net_ev_threshold: number;
  count_net_ev_above_threshold: number;
}

interface DashboardStats {
  totalPairs: number;
  verifiedPairs: number;
  unverifiedPairs: number;
  scanCountTotal: number;
  lastOppsScan: LastOppsScan | null;
  lastPairScan: any | null;
  recentOpportunities: any[]; 
}

export default function DashboardClient({ stats: initialStats }: { stats: DashboardStats }) {
  const { t } = useI18n();
  const [stats, setStats] = useState<DashboardStats>(initialStats);
  const [isPolling, setIsPolling] = useState(true);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (isPolling) {
      intervalId = setInterval(async () => {
        try {
          const res = await fetch('/api/dashboard/stats');
          if (res.ok) {
            const newStats = await res.json();
            setStats(newStats);
          }
        } catch (error) {
          console.error('Failed to poll stats:', error);
        }
      }, 2000); // Poll every 2 seconds
    }

    return () => clearInterval(intervalId);
  }, [isPolling]);

  const lastRunId = stats.lastOppsScan?.run_id;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('Dashboard')}</h1>
      
      {/* Removed KalshiPanel as per M1.5 requirements */}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Card 1: Total Pairs */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('Total Pairs')}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalPairs}</div>
            <p className="text-xs text-muted-foreground">
              {stats.verifiedPairs} {t('verified')} / {stats.unverifiedPairs} {t('unverified')}
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Scan Count (Previously Snapshots) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('Scan Count')}</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.scanCountTotal}</div>
            <p className="text-xs text-muted-foreground">{t('Total completed scans')}</p>
          </CardContent>
        </Card>

        {/* Card 3: Last Scan Opportunities */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('Last Scan Opps')}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats.lastOppsScan?.opportunities_total ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('Net EV Threshold')}: ${stats.lastOppsScan?.net_ev_threshold ?? 0}
            </p>
          </CardContent>
        </Card>

        {/* Card 4: Last Scan Info */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('Last Scan Info')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold">
              Run ID: <span className="text-gray-500">#{lastRunId ?? '-'}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.lastOppsScan?.completed_at ? new Date(stats.lastOppsScan.completed_at).toLocaleString() : t('Never')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>{t('Recent Opportunities')}</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentOpportunities.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">
                {t('No opportunities found yet.')} 
                <br />{t('Add pairs and verify them to start scanning.')}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Minimal list for recent opps */}
                {stats.recentOpportunities.map((opp: any) => (
                    <div key={opp.id} className="flex justify-between items-center border-b pb-2">
                        <div>
                            <div className="font-semibold">{opp.pair?.title_pm || 'Unknown'}</div>
                            <div className="text-xs text-gray-500">{new Date(opp.ts).toLocaleTimeString()}</div>
                        </div>
                        <div className="text-green-600 font-bold">${opp.profit_total?.toFixed(2)}</div>
                    </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>{t('Edge Distribution')}</CardTitle>
          </CardHeader>
          <CardContent>
             <div className="flex items-end h-48 gap-2 justify-center pb-2">
                {/* Dummy Bars for visual if empty */}
                <div className="w-8 bg-gray-200 h-10 rounded-t"></div>
                <div className="w-8 bg-gray-200 h-24 rounded-t"></div>
                <div className="w-8 bg-gray-200 h-16 rounded-t"></div>
                <div className="w-8 bg-gray-200 h-8 rounded-t"></div>
             </div>
             <p className="text-center text-xs text-gray-500">{t('Waiting for data...')}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
