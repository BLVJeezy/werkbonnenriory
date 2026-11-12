import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { markPurchaseInvoicePaid } from '@/lib/purchase-invoices.functions';

export function MarkPurchasePaid({ id, staged = false, disabled = false, onSaved }: { id: string; staged?: boolean; disabled?: boolean; onSaved: () => Promise<unknown> }) {
  const markPaid = useServerFn(markPurchaseInvoicePaid);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' }));
  async function confirm() {
    setBusy(true);
    try {
      await markPaid({ data: { id, paidDate: date, confirmed: true } });
      await onSaved(); setOpen(false); toast.success('Als betaald gemarkeerd');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Bijwerken mislukt'); }
    finally { setBusy(false); }
  }
  return <>
    <Button size="sm" variant="outline" disabled={disabled || busy} onClick={() => setOpen(true)}><CheckCircle2 className="size-4" />Al betaald</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Factuur al volledig betaald?</DialogTitle></DialogHeader>
        <p className="text-sm">Bevestig alleen wanneer het volledige bedrag al betaald is. Deze factuur wordt niet meer opgenomen in een nieuw betaalbestand. Er wordt geen betaling uitgevoerd of bankverrichting geboekt.</p>
        {staged && <p className="text-sm font-bold text-destructive">Er is al een betaalbestand gemaakt. Controleer bij de bank dat er geen tweede betaling klaarstaat; een eerder gedownload bestand wordt niet aangepast.</p>}
        <div className="space-y-2"><Label htmlFor={`paid-date-${id}`}>Betaaldatum</Label><Input id={`paid-date-${id}`} type="date" value={date} max={new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' })} onChange={e => setDate(e.target.value)} disabled={busy} /></div>
        <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Annuleren</Button><Button disabled={busy || !date} onClick={confirm}>{busy ? 'Opslaan…' : 'Bevestigen: volledig betaald'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}