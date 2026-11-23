import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { markPurchaseInvoicePaid, undoPurchaseInvoicePayment } from '@/lib/purchase-invoices.functions';

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

export function UndoPurchasePaid({ id, bankLinked = false, disabled = false, onSaved }: { id: string; bankLinked?: boolean; disabled?: boolean; onSaved: () => Promise<unknown> }) {
  const undoPaid = useServerFn(undoPurchaseInvoicePayment);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function confirmUndo() {
    setBusy(true);
    try {
      const res = await undoPaid({ data: { id, confirmed: true } });
      await onSaved();
      setOpen(false);
      toast.success(res.bankTransactionsUndone > 0 ? 'Betaling ongedaan gemaakt; bankverrichting staat weer bij Te verwerken' : 'Betaling ongedaan gemaakt');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Ongedaan maken mislukt'); }
    finally { setBusy(false); }
  }
  return <>
    <Button size="sm" variant="outline" className="text-destructive" disabled={disabled || busy} onClick={() => setOpen(true)}><RotateCcw className="size-4" />Betaling ongedaan maken</Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent>
        <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-destructive" />Betaling ongedaan maken?</DialogTitle></DialogHeader>
        <p className="text-sm">De betaalregistratie wordt verwijderd en deze aankoopfactuur komt opnieuw op <strong>Goedgekeurd</strong> te staan.</p>
        <p className="text-sm font-bold text-destructive">
          {bankLinked
            ? 'Let op: de gekoppelde bankverrichting wordt weer op Te verwerken gezet en de bijhorende bankboeking wordt teruggedraaid. Bij een verdeelde betaling worden ook de andere facturen op die verrichting losgekoppeld.'
            : 'Let op: als er een bankverrichting aan deze factuur gekoppeld was, wordt die weer op Te verwerken gezet en wordt de bankboeking teruggedraaid. Een effectief uitgevoerde bankoverschrijving zelf wordt niet teruggeboekt bij de bank.'}
        </p>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Annuleren</Button>
          <Button variant="destructive" disabled={busy} onClick={confirmUndo}>{busy ? 'Ongedaan maken…' : 'Betaling ongedaan maken'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}