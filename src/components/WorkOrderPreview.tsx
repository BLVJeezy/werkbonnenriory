import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Download, Eye, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { previewWerkbonPdf } from '@/lib/werkbon-preview.functions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PdfPreview } from '@/components/PdfPreview';
import { werkbonNr } from '@/lib/werkbon-number';

export function WorkOrderPreview({ workOrderId }: { workOrderId: string }) {
  const preview = useServerFn(previewWerkbonPdf);
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const [result, setResult] = useState<{ base64: string; number: number | null } | null>(null);
  const [error, setError] = useState('');
  async function open() {
    setOpened(true);
    setResult(null);
    setError('');
    setBusy(true);
    try {
      const response = await preview({ data: { workOrderId } });
      if (!response.ok) throw new Error('Werkbonvoorbeeld kon niet geladen worden');
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const nrHeader = response.headers.get('X-Werkbon-Number');
      setResult({ base64: btoa(binary), number: nrHeader ? Number(nrHeader) : null });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Werkbonvoorbeeld kon niet geopend worden';
      setError(message);
      toast.error(message);
    } finally { setBusy(false); }
  }
  function download() {
    if (!result) return;
    const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `Werkbon-${result.number ?? "nieuw"}.pdf`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  return <>
    <Button variant="outline" disabled={busy} onClick={open}>{busy ? <LoaderCircle className="animate-spin" /> : <Eye />} {busy ? 'Voorbeeld laden…' : 'Voorbeeld werkbon'}</Button>
    <Dialog open={opened} onOpenChange={setOpened}>
      <DialogContent aria-describedby={undefined} className="flex max-h-[92dvh] w-[calc(100%-1rem)] max-w-4xl flex-col p-3 sm:p-5">
        <DialogHeader className="shrink-0 pr-8"><DialogTitle>Voorbeeld werkbon{result ? ` ${werkbonNr(result.number)}` : ''}</DialogTitle></DialogHeader>
        {result && <Button className="shrink-0 self-start" size="sm" variant="outline" onClick={download}><Download /> PDF downloaden</Button>}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {busy && <p role="status" className="flex items-center justify-center gap-2 p-8 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /> Werkbon laden…</p>}
          {error && <p role="alert" className="p-4 text-destructive">{error}</p>}
          {result && <PdfPreview base64={result.base64} />}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}