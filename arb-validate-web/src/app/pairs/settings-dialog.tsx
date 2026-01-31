
'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Settings as SettingsIcon, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';

export function SettingsDialog({ triggerClassName }: { triggerClassName?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const [lightVerifyEnabled, setLightVerifyEnabled] = useState(true);
  const [deepVerifyScheduleH, setDeepVerifyScheduleH] = useState(24);
  const [verifiedTtlDays, setVerifiedTtlDays] = useState(7);
  const [failureDemotionCount, setFailureDemotionCount] = useState(1);

  useEffect(() => {
    if (open) fetchSettings();
  }, [open]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setLightVerifyEnabled(data.light_verify_enabled);
        setDeepVerifyScheduleH(data.deep_verify_schedule_h);
        setVerifiedTtlDays(data.verified_ttl_days);
        setFailureDemotionCount(data.failure_demotion_count);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify({
            light_verify_enabled: lightVerifyEnabled,
            deep_verify_schedule_h: deepVerifyScheduleH,
            verified_ttl_days: verifiedTtlDays,
            failure_demotion_count: failureDemotionCount
        }),
      });
      if (res.ok) {
        setOpen(false);
      } else {
        alert('Failed to save');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className={triggerClassName}>
            <SettingsIcon className="h-4 w-4 mr-2" />
            {t('Verification Settings')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('Verification Settings')}</DialogTitle>
        </DialogHeader>
        {loading && <div className="flex justify-center"><Loader2 className="animate-spin" /></div>}
        {!loading && (
            <div className="grid gap-4 py-4">
            <div className="flex items-center justify-between">
                <Label htmlFor="light-verify">{t('Light Verify Gate (Pre-Scan)')}</Label>
                <Switch id="light-verify" checked={lightVerifyEnabled} onCheckedChange={setLightVerifyEnabled} />
            </div>
            
            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="deep-schedule" className="col-span-3">{t('Deep Verify Schedule (Hours)')}</Label>
                <Input id="deep-schedule" type="number" value={deepVerifyScheduleH} onChange={e => setDeepVerifyScheduleH(parseInt(e.target.value))} className="col-span-1" />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="ttl" className="col-span-3">{t('Verified TTL (Days)')}</Label>
                <Input id="ttl" type="number" value={verifiedTtlDays} onChange={e => setVerifiedTtlDays(parseInt(e.target.value))} className="col-span-1" />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="demotion" className="col-span-3">{t('Failure Demotion Count')}</Label>
                <Input id="demotion" type="number" value={failureDemotionCount} onChange={e => setFailureDemotionCount(parseInt(e.target.value))} className="col-span-1" />
            </div>
            </div>
        )}
        <DialogFooter>
          <Button onClick={handleSave} disabled={loading}>{t('Save changes')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
