import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { Eye, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { previewWerkbonPdf } from '@/lib/werkbon-preview.functions';

export function WorkOrderPreview({ workOrderId }: { workOrderId: string }) {
  const preview = useServerFn(previewWerkbonPdf);
  const [busy, setBusy] = useState(false);
  async function open() {
    const tab = window.open('', '_blank');
    if (!tab) { toast.error('Sta pop-ups toe om het werkbonvoorbeeld te openen'); return; }
    tab.opener = null;
    tab.document.title = 'Werkbonvoorbeeld — Riory';
    tab.document.body.textContent = 'Werkbonvoorbeeld laden…';
    setBusy(true);
    try {
      const result = await preview({ data: { workOrderId } });
      const bytes = Uint8Array.from(atob(result.base64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      tab.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 300000);
    } catch (error) {
      tab.close();
      toast.error(error instanceof Error ? error.message : 'Werkbonvoorbeeld kon niet geopend worden');
    } finally { setBusy(false); }
  }
  return <Button variant="outline" disabled={busy} onClick={open}>{busy ? <LoaderCircle className="animate-spin" /> : <Eye />} {busy ? 'Voorbeeld laden…' : 'Voorbeeld werkbon'}</Button>;
}