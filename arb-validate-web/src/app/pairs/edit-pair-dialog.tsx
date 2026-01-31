
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { Pair } from '@prisma/client';
import { useI18n } from '@/lib/i18n/context';

export function EditPairDialog({ pair }: { pair: Pair }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title_pm: pair.title_pm,
    title_kh: pair.title_kh,
    status: pair.status,
    notes: pair.notes || '',
    pm_yes_token_id: pair.pm_yes_token_id || '',
    kh_ticker: pair.kh_ticker || '',
    pm_open_url: pair.pm_open_url || '',
    kh_open_url: pair.kh_open_url || ''
  });

  const handleSave = async () => {
    setLoading(true);
    try {
        const res = await fetch(`/api/pairs/${pair.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (res.ok) {
            setOpen(false);
            router.refresh();
        } else {
            const err = await res.json().catch(() => ({}));
            alert(`Failed to update pair: ${err.error || res.statusText}`);
        }
    } catch (e: any) {
        alert(`Error updating pair: ${e.message}`);
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('Are you sure you want to delete this pair? This cannot be undone.'))) return;
    
    setLoading(true);
    try {
        const res = await fetch(`/api/pairs/${pair.id}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            setOpen(false);
            router.refresh();
        } else {
            const err = await res.json().catch(() => ({}));
            alert(t('Failed to delete pair: ') + (err.error || res.statusText));
        }
    } catch (e: any) {
        alert(t('Error deleting pair: ') + e.message);
    } finally {
        setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
            <Pencil className="h-4 w-4 mr-1" /> {t('Edit')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('Edit Pair')} #{pair.id}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>{t('Status')}</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({...formData, status: v as any})}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="unverified">{t('Unverified')}</SelectItem>
                            <SelectItem value="verified">{t('Verified')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label>{t('Notes')}</Label>
                    <Input value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} />
                </div>
            </div>

            <div className="space-y-2">
                <Label>{t('PM Title')}</Label>
                <Input value={formData.title_pm} onChange={(e) => setFormData({...formData, title_pm: e.target.value})} />
            </div>
            
            <div className="space-y-2">
                <Label>{t('PM Yes Token ID')}</Label>
                <Input className="font-mono text-xs" value={formData.pm_yes_token_id} onChange={(e) => setFormData({...formData, pm_yes_token_id: e.target.value})} />
            </div>

            <div className="space-y-2">
                <Label>{t('PM Open URL')}</Label>
                <Input className="font-mono text-xs" value={formData.pm_open_url} onChange={(e) => setFormData({...formData, pm_open_url: e.target.value})} placeholder="https://polymarket.com/event/..." />
            </div>

            <div className="space-y-2">
                <Label>{t('KH Title')}</Label>
                <Input value={formData.title_kh} onChange={(e) => setFormData({...formData, title_kh: e.target.value})} />
            </div>

            <div className="space-y-2">
                <Label>{t('KH Ticker')}</Label>
                <Input className="font-mono text-xs" value={formData.kh_ticker} onChange={(e) => setFormData({...formData, kh_ticker: e.target.value})} />
            </div>

            <div className="space-y-2">
                <Label>{t('KH Open URL')}</Label>
                <Input className="font-mono text-xs" value={formData.kh_open_url} onChange={(e) => setFormData({...formData, kh_open_url: e.target.value})} placeholder="https://kalshi.com/markets/..." />
            </div>

            <div className="flex justify-between pt-4 border-t mt-4">
                <Button variant="destructive" onClick={handleDelete} disabled={loading}>
                    {loading ? <Loader2 className="animate-spin mr-2" /> : <><Trash2 className="h-4 w-4 mr-2" /> {t('Delete Pair')}</>}
                </Button>
                <Button onClick={handleSave} disabled={loading}>
                    {loading ? <Loader2 className="animate-spin mr-2" /> : t('Save Changes')}
                </Button>
            </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
