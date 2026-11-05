import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Browser-rendered PDF pages work even where native blob PDF tabs are blocked. */
export function PdfPreview({ base64 }: { base64: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => void) | undefined;
    const host = container.current;
    if (!host) return;
    host.replaceChildren();
    setLoading(true);
    setError('');
    async function render() {
      const pdfjs = await import('pdfjs-dist');
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      if (cancelled || !host) return;
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      const task = pdfjs.getDocument({ data: Uint8Array.from(atob(base64), c => c.charCodeAt(0)), useSystemFonts: true });
      destroy = () => { void task.destroy(); };
      const pdf = await task.promise;
      for (let i = 1; i <= pdf.numPages && !cancelled; i++) {
        const page = await pdf.getPage(i);
        if (cancelled) return;
        const width = Math.max(240, Math.min(host.clientWidth, 1000));
        const original = page.getViewport({ scale: 1 });
        const ratio = Math.min(window.devicePixelRatio || 1, 2) * 2;
        const viewport = page.getViewport({ scale: width / original.width * ratio });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        canvas.className = 'block h-auto max-w-none';
        canvas.setAttribute('aria-label', `PDF pagina ${i}`);
        host.appendChild(canvas);
        const canvasContext = canvas.getContext('2d');
        if (!canvasContext) throw new Error('PDF canvas unavailable');
        await page.render({ canvasContext, viewport }).promise;
        if (i === 1 && !cancelled) setLoading(false);
      }
    }
    void render().catch((cause) => { if (!cancelled) { console.error('PDF preview rendering failed', cause); setError('Het voorbeeld kon niet geladen worden. Download de PDF om deze te bekijken.'); setLoading(false); } });
    return () => { cancelled = true; destroy?.(); host.replaceChildren(); };
  }, [base64]);
  return <div className="relative min-h-40">
    {loading && <p role="status" className="flex items-center justify-center gap-2 p-6 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /> Voorbeeld laden…</p>}
    {error && <p role="alert" className="p-4 text-destructive">{error}</p>}
    <div className="sticky top-0 z-10 flex justify-end gap-1 p-1">
      <Button size="icon" variant="secondary" aria-label="Uitzoomen" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z - 0.5))}><ZoomOut /></Button>
      <span className="self-center rounded bg-secondary px-2 text-sm font-mono">{Math.round(zoom * 100)}%</span>
      <Button size="icon" variant="secondary" aria-label="Inzoomen" disabled={zoom >= 4} onClick={() => setZoom(z => Math.min(4, z + 0.5))}><ZoomIn /></Button>
    </div>
    <div className="overflow-auto"><div ref={container} className="space-y-4 [&>canvas]:w-[var(--pdf-zoom)]" style={{ ['--pdf-zoom' as string]: `${zoom * 100}%` }} /></div>
  </div>;
}