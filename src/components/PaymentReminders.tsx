import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { BellRing, Download, Eye, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from './ui/dialog';
import { previewPaymentReminder, sendPaymentReminder } from '@/lib/payment-reminders.functions';
import { reminderTitles, type DebtorKind, type ReminderDocument, type ReminderStage } from '@/lib/payment-reminders';
import { euro } from '@/lib/billing';

type Preview = { document: ReminderDocument; fingerprint: string; base64: string };
export function PaymentReminders({ invoiceId }: { invoiceId: string }) {
  const qc = useQueryClient();
  const previewFn = useServerFn(previewPaymentReminder);
  const sendFn = useServerFn(sendPaymentReminder);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DebtorKind>('consumer');
  const [terms, setTerms] = useState(false);
  const [undisputed, setUndisputed] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { data: history = [] } = useQuery({ queryKey: ['invoice-reminders', invoiceId], queryFn: async () => {
    const { data, error } = await supabase.from('invoice_reminders').select('*').eq('invoice_id', invoiceId).order('stage');
    if (error) throw new Error(error.message);
    return data;
  }, refetchInterval: open ? 10000 : false });
  const last = history[history.length - 1];
  const next = ((last?.stage ?? 0) + 1) as ReminderStage;
  const blocked = next > 3 || Boolean(last && last.status !== 'accepted');
  useEffect(() => {
    if (!preview) { setPdfUrl(null); return; }
    const bytes = Uint8Array.from(atob(preview.base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [preview]);
  const clear = () => { setPreview(null); setError(''); };
  async function makePreview() {
    setBusy(true); clear();
    try { setPreview(await previewFn({ data: { invoiceId, stage: next, debtorKind: kind, termsAccepted: terms, undisputed } })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Voorbeeld mislukt.'); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!preview) return;
    setBusy(true); setError('');
    try {
      const result = await sendFn({ data: { invoiceId, stage: preview.document.stage, debtorKind: kind, termsAccepted: terms, undisputed, fingerprint: preview.fingerprint } });
      toast.success(`Herinnering door Outlook aanvaard voor ${result.recipient}`);
      setPreview(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'Verzending mislukt.'); }
    finally { setBusy(false); await qc.invalidateQueries({ queryKey: ['invoice-reminders', invoiceId] }); }
  }
  return <>
    <Button variant="outline" size="sm" onClick={() => { setOpen(true); clear(); const previous = last?.document as Partial<ReminderDocument> | undefined; setKind(previous?.debtorKind ?? 'consumer'); }}><BellRing className="h-4 w-4" />Herinneringen{last ? ` (${last.stage}/3)` : ''}</Button>
    <Dialog open={open} onOpenChange={v => { if (!busy) setOpen(v); }}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogTitle>Betalingsherinneringen</DialogTitle>
        <DialogDescription>Factuurherinnering vanuit info@riory.be. Outlook-aanvaarding is geen bewijs van ontvangst.</DialogDescription>
        {history.length > 0 && <ol className="space-y-2 border-b pb-3">{history.map(h => <li key={h.id} className="text-sm">
          <strong>{h.stage}. {reminderTitles[h.stage as ReminderStage]}</strong> — {h.status === 'accepted' ? `Door Outlook aanvaard ${new Date(h.sent_at ?? h.created_at).toLocaleString('nl-BE')}` : h.status === 'sending' ? 'Verzending gestart — controleer Outlook bij uitblijven bevestiging' : 'Verzending onzeker — controleer Outlook'}
          {h.error && <p className="break-words text-destructive">{h.error}</p>}
          <details className="mt-1"><summary className="cursor-pointer">Verzonden tekst</summary><p className="whitespace-pre-wrap break-words">{(h.document as unknown as ReminderDocument).body}</p></details>
        </li>)}</ol>}
        {blocked ? <p className="font-medium">{next > 3 ? 'Alle drie de stappen zijn doorlopen. Beoordeel verdere invordering met een jurist.' : 'Deze verzending moet eerst in Outlook gecontroleerd worden. Er wordt geen dubbele herinnering verzonden.'}</p> : <>
          <h3 className="font-bold">{next}. {reminderTitles[next]}</h3>
          <div className="space-y-2">
            <Label htmlFor={`kind-${invoiceId}`}>Klanttype voor deze opdracht</Label>
            <select id={`kind-${invoiceId}`} className="w-full rounded border bg-background p-2 text-foreground" value={kind} disabled={busy || history.length > 0} onChange={e => { setKind(e.target.value as DebtorKind); clear(); }}>
              <option value="consumer">Particulier / consument</option><option value="business">Onderneming — opdracht voor beroepsdoeleinden</option>
            </select>
            <Label className="flex items-start gap-2"><Checkbox checked={undisputed} disabled={busy} onCheckedChange={v => { setUndisputed(v === true); clear(); }} />Het saldo, betalingen en creditnota's zijn gecontroleerd; er is geen lopende betwisting, betalingsregeling of schuldbemiddeling.</Label>
            <Label className="flex items-start gap-2"><Checkbox checked={terms} disabled={busy} onCheckedChange={v => { setTerms(v === true); clear(); }} />De voorwaarden van 18/09/2026 waren vóór de opdracht geldig overeengekomen en zijn op deze klant van toepassing.</Label>
          </div>
          <p className="text-sm text-muted-foreground">Eerste herinnering gratis; minstens 14 kalenderdagen betaaltermijn. Daarna maximaal één forfaitaire vergoeding volgens artikel 11. Er wordt geen interest of aparte aanmaningskost gevorderd.</p>
          {next === 3 && <p className="text-sm font-medium">Voor sterker bewijs van de ingebrekestelling: verstuur de PDF ook aangetekend. Deze app verzendt geen aangetekende brief.</p>}
          <p className="text-xs text-muted-foreground">Geen juridische certificering: laat de voorwaarden en een betwist dossier beoordelen door een Belgische jurist.</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !undisputed || (next > 1 && !terms)} onClick={makePreview}><Eye className="h-4 w-4" />{busy ? 'Even geduld…' : 'Voorbeeld controleren'}</Button>
            {pdfUrl && <Button variant="outline" asChild><a href={pdfUrl} download={`Herinnering-${next}-${preview?.document.number}.pdf`}><Download className="h-4 w-4" />PDF</a></Button>}
          </div>
          {preview && <>
            <div className="grid grid-cols-2 gap-2 border-y py-3 text-sm"><span>Hoofdsom</span><strong>{euro(preview.document.principal)}</strong><span>Eenmalige vergoeding</span><strong>{euro(preview.document.compensation)}</strong><span>Totaal te betalen</span><strong>{euro(preview.document.total)}</strong></div>
            <p className="break-words text-sm">Aan: <strong>{preview.document.recipient}</strong> · Betalen uiterlijk {preview.document.deadline}</p>
            <div className="max-h-72 overflow-y-auto whitespace-pre-wrap break-words border p-3 text-sm">{preview.document.body}</div>
            <Button disabled={busy} onClick={send}><Send className="h-4 w-4" />{busy ? 'Versturen…' : 'Deze herinnering nu versturen'}</Button>
          </>}
        </>}
        {error && <p role="alert" className="break-words text-sm font-medium text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
  </>;
}