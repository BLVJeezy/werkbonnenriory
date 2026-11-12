import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Download, Save, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { generateInsuranceReport, saveInsuranceReport } from '@/lib/insurance-report.functions';
import { insuranceReportPdf, sendInsuranceReport } from '@/lib/quotes.functions';

export function InsuranceReportPanel({ id, notes, initialText, email }: { id: string; notes: string | null; initialText: string | null; email: string | null }) {
  const [text, setText] = useState(initialText ?? notes ?? '');
  const [recipient, setRecipient] = useState(email ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generate = useServerFn(generateInsuranceReport); const save = useServerFn(saveInsuranceReport);
  const pdf = useServerFn(insuranceReportPdf); const send = useServerFn(sendInsuranceReport);
  async function run(action: string) {
    setBusy(action); setError(null);
    try {
      if (action === 'ai') {
        const result = await generate({ data: { workOrderId: id } });
        if (result.error) throw new Error(result.error);
        if (result.text) setText(result.text);
      } else {
        await save({ data: { workOrderId: id, text } });
        if (action === 'pdf') {
          const result = await pdf({ data: { workOrderId: id } });
          const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(result.base64), c => c.charCodeAt(0))], { type: 'application/pdf' }));
          const a = document.createElement('a'); a.href = url; a.download = result.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        } else if (action === 'send') {
          await send({ data: { workOrderId: id, email: recipient } });
          toast.success(`Verslag aanvaard door Outlook voor ${recipient}`);
        } else toast.success('Verslag opgeslagen');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Verslag verwerken mislukt.'); }
    finally { setBusy(null); }
  }
  return <section className="space-y-4 py-4">
    <h2 className="text-xl font-bold">Verslag voor de verzekering</h2>
    <div><p className="mb-2 font-semibold">Bevindingen van de technieker</p><p className="whitespace-pre-wrap text-muted-foreground">{notes || 'Nog geen bevindingen ingevuld.'}</p></div>
    <Button variant="outline" disabled={!!busy || !notes?.trim()} onClick={() => run('ai')}><Sparkles size={16} />{busy === 'ai' ? 'Tekst opstellen…' : 'Tekst opstellen met AI'}</Button>
    <label className="block space-y-2"><span className="font-semibold">Verslagtekst — zonder prijzen</span><Textarea aria-label="Verslagtekst" className="min-h-72" value={text} onChange={e => setText(e.target.value)} /></label>
    <label className="block space-y-2"><span className="font-semibold">Verzenden naar</span><Input type="email" aria-label="Verslag verzenden naar" value={recipient} onChange={e => setRecipient(e.target.value)} /></label>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={!!busy || !text.trim()} onClick={() => run('save')}><Save size={16} />Opslaan</Button>
      <Button variant="outline" disabled={!!busy || !text.trim()} onClick={() => run('pdf')}><Download size={16} />Download PDF</Button>
      <Button disabled={!!busy || !text.trim() || !recipient.trim()} onClick={() => { if (confirm(`Verslag met foto's verzenden naar ${recipient}?`)) run('send'); }}><Send size={16} />{busy === 'send' ? 'Verzenden…' : 'Verslag verzenden'}</Button>
    </div>
  </section>;
}