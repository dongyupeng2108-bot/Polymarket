
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Settings } from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';

export function VerificationSettingsDialog() {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState({
    light_verify_enabled: true,
    deep_verify_schedule_h: 24,
    verified_ttl_days: 7,
    failure_demotion_count: 1
  });

  useEffect(() => {
    if (open) {
      fetchSettings();
    }
  }, [open]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings({
            light_verify_enabled: data.light_verify_enabled ?? true,
            deep_verify_schedule_h: data.deep_verify_schedule_h ?? 24,
            verified_ttl_days: data.verified_ttl_days ?? 7,
            failure_demotion_count: data.failure_demotion_count ?? 1
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        alert('Failed to save settings');
      }
    } catch (e: any) {
      alert('Error saving settings: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title={t('Verification Settings')}>
            <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('Verification Settings')}</DialogTitle>
        </DialogHeader>

        {loading ? (
            <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        ) : (
            <div className="space-y-6 py-4">
                <div className="flex items-center justify-between space-x-2">
                    <div className="space-y-1">
                        <Label>{t('Light Verify Gate')}</Label>
                        <p className="text-sm text-gray-500">
                            {t('Enable Light Verify before Opportunity Scan')}
                        </p>
                    </div>
                    <Switch 
                        checked={settings.light_verify_enabled}
                        onCheckedChange={(checked) => setSettings({...settings, light_verify_enabled: checked})}
                    />
                </div>

                <div className="space-y-2">
                    <Label>{t('Deep Verify Schedule (Hours)')}</Label>
                    <Select 
                        value={String(settings.deep_verify_schedule_h)} 
                        onValueChange={(v) => setSettings({...settings, deep_verify_schedule_h: parseInt(v)})}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="6">6h</SelectItem>
                            <SelectItem value="12">12h</SelectItem>
                            <SelectItem value="24">24h</SelectItem>
                            <SelectItem value="48">48h</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-2">
                    <Label>{t('Verified TTL (Days)')}</Label>
                    <Input 
                        type="number" 
                        min="1"
                        value={settings.verified_ttl_days}
                        onChange={(e) => setSettings({...settings, verified_ttl_days: parseInt(e.target.value) || 7})}
                    />
                </div>

                <div className="space-y-2">
                    <Label>{t('Failure Demotion Count')}</Label>
                    <Select 
                        value={String(settings.failure_demotion_count)} 
                        onValueChange={(v) => setSettings({...settings, failure_demotion_count: parseInt(v)})}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">1 ({t('Strict')})</SelectItem>
                            <SelectItem value="2">2 ({t('Lenient')})</SelectItem>
                            <SelectItem value="3">3</SelectItem>
                        </SelectContent>
                    </Select>
                    <p className="text-xs text-gray-500">
                        {t('Demote to UNVERIFIED after N consecutive failures')}
                    </p>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={() => setOpen(false)}>{t('Cancel')}</Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('Save Changes')}
                    </Button>
                </div>
            </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
