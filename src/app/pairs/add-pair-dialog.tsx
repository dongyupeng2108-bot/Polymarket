
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Check, ArrowRight, Plus } from 'lucide-react';
import { useI18n } from '@/lib/i18n/context';

export function AddPairDialog({ triggerClassName }: { triggerClassName?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // PM State
  const [pmInput, setPmInput] = useState('');
  const [pmData, setPmData] = useState<any>(null);
  const [selectedPmMarketIndex, setSelectedPmMarketIndex] = useState<string>('0');
  const [selectedPmOutcomeIndex, setSelectedPmOutcomeIndex] = useState<string>('0');

  // KH State
  const [khInput, setKhInput] = useState('');
  const [khData, setKhData] = useState<any>(null);

  // Final State
  const [pairTitle, setPairTitle] = useState('');

  const resolvePm = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/resolve/pm', {
        method: 'POST',
        body: JSON.stringify({ input: pmInput }),
      });
      const data = await res.json();
      if (res.ok) {
        setPmData(data);
        setPairTitle(data.title); // Default title
      } else {
        alert('Error: ' + data.error);
      }
    } catch (e) {
      alert('Failed to resolve PM');
    } finally {
      setLoading(false);
    }
  };

  const resolveKh = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/resolve/kh', {
        method: 'POST',
        body: JSON.stringify({ input: khInput }),
      });
      const data = await res.json();
      if (res.ok) {
        setKhData(data);
      } else {
        alert('Error: ' + data.error);
      }
    } catch (e) {
      alert('Failed to resolve KH');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!pmData || !khData) return;

    const pmMarket = pmData.markets[parseInt(selectedPmMarketIndex)];
    const pmOutcome = pmMarket.tokens[parseInt(selectedPmOutcomeIndex)];
    
    let pmNoTokenId = null;
    if (pmMarket.tokens.length === 2) {
        pmNoTokenId = pmMarket.tokens.find((t: any) => t !== pmOutcome)?.tokenId;
    }

    const payload = {
        title_pm: pairTitle,
        title_kh: khData.title,
        pm_yes_token_id: pmOutcome.tokenId,
        pm_no_token_id: pmNoTokenId,
        pm_market_slug: pmData.slug,
        kh_ticker: khData.ticker,
        kh_yes_contract_id: khData.ticker, 
        kh_no_contract_id: null,
        status: 'unverified'
    };

    setLoading(true);
    try {
        const res = await fetch('/api/pairs', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            setOpen(false);
            router.refresh();
            // Reset
            setStep(1);
            setPmData(null);
            setKhData(null);
            setPmInput('');
            setKhInput('');
        } else {
            alert(t('Failed to save'));
        }
    } finally {
        setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={triggerClassName || "bg-emerald-600 hover:bg-emerald-700 text-white gap-2"}>
          <Plus size={16} /> {t('Manual Add New Pair')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('Add Event Pair')} ({t('Step')} {step}/3)</DialogTitle>
        </DialogHeader>

        {/* STEP 1: POLYMARKET */}
        {step === 1 && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('Polymarket URL or Slug')}</Label>
              <div className="flex gap-2">
                <Input 
                  value={pmInput} 
                  onChange={(e) => setPmInput(e.target.value)} 
                  placeholder="https://polymarket.com/event/..." 
                />
                <Button onClick={resolvePm} disabled={loading || !pmInput}>
                  {loading ? <Loader2 className="animate-spin" /> : t('Resolve')}
                </Button>
              </div>
            </div>

            {pmData && (
              <div className="space-y-4 border p-4 rounded bg-slate-50">
                <div>
                  <Label className="text-xs text-muted-foreground">{t('Event Title')}</Label>
                  <p className="font-medium">{pmData.title}</p>
                </div>

                <div className="space-y-2">
                  <Label>{t('Select Market Question')}</Label>
                  <Select value={selectedPmMarketIndex} onValueChange={setSelectedPmMarketIndex}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pmData.markets.map((m: any, idx: number) => (
                        <SelectItem key={idx} value={idx.toString()}>
                          {m.question}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>{t('Select Outcome (YES)')}</Label>
                  <Select value={selectedPmOutcomeIndex} onValueChange={setSelectedPmOutcomeIndex}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {pmData.markets[parseInt(selectedPmMarketIndex)]?.tokens.map((t: any, idx: number) => (
                        <SelectItem key={idx} value={idx.toString()}>
                          {t.label} ({t.tokenId.slice(0, 8)}...)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!pmData}>
                {t('Next')} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: KALSHI */}
        {step === 2 && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('Kalshi URL or Ticker')}</Label>
              <div className="flex gap-2">
                <Input 
                  value={khInput} 
                  onChange={(e) => setKhInput(e.target.value)} 
                  placeholder="e.g. KXFED-23DEC-5.00" 
                />
                <Button onClick={resolveKh} disabled={loading || !khInput}>
                  {loading ? <Loader2 className="animate-spin" /> : t('Resolve')}
                </Button>
              </div>
            </div>

            {khData && (
              <div className="space-y-4 border p-4 rounded bg-slate-50">
                <div>
                  <Label className="text-xs text-muted-foreground">{t('Market Title')}</Label>
                  <p className="font-medium">{khData.title}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t('Ticker')}</Label>
                  <p className="font-mono">{khData.ticker}</p>
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>{t('Back')}</Button>
              <Button onClick={() => setStep(3)} disabled={!khData}>
                {t('Next')} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW */}
        {step === 3 && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('Pair Title (Internal)')}</Label>
              <Input value={pairTitle} onChange={(e) => setPairTitle(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="border p-3 rounded">
                <span className="font-bold block mb-2">{t('Polymarket')}</span>
                <p className="truncate" title={pmData?.title}>{pmData?.title}</p>
                <div className="mt-2 text-xs text-muted-foreground">
                    <p>Slug: {pmData?.slug}</p>
                    <p>{t('Outcome')}: {pmData?.markets[parseInt(selectedPmMarketIndex)]?.tokens[parseInt(selectedPmOutcomeIndex)]?.label}</p>
                    <p>{t('Token')}: {pmData?.markets[parseInt(selectedPmMarketIndex)]?.tokens[parseInt(selectedPmOutcomeIndex)]?.tokenId?.slice(0, 10)}...</p>
                </div>
              </div>
              <div className="border p-3 rounded">
                <span className="font-bold block mb-2">{t('Kalshi')}</span>
                <p className="truncate" title={khData?.title}>{khData?.title}</p>
                <div className="mt-2 text-xs text-muted-foreground">
                    <p>{t('Ticker')}: {khData?.ticker}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>{t('Back')}</Button>
              <Button onClick={handleSave} disabled={loading}>
                {loading ? <Loader2 className="animate-spin mr-2" /> : <Check className="mr-2 h-4 w-4" />}
                {t('Confirm & Save')}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
