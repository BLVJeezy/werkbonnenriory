import { useEffect, useRef, useState } from 'react';
import { Camera, Crop, ImagePlus, LoaderCircle, Plus, RefreshCw, RotateCw, ScanLine, SlidersHorizontal, Trash2 } from 'lucide-react';
import {
  DEFAULT_SCAN_ADJUSTMENTS,
  fullFrameQuad,
  loadScanSource,
  pagesToPdf,
  renderScannedPage,
  type LoadedScanSource,
  type Quad,
  type ScanAdjustments,
  type ScanFilter,
} from '@/lib/document-scan';
import { ScanCornerEditor } from '@/components/ScanCornerEditor';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

type Mode = 'capture' | 'preview' | 'crop';

const FILTER_LABELS: { id: ScanFilter; label: string }[] = [
  { id: 'document', label: 'Document' },
  { id: 'bw', label: 'Zwart-wit' },
  { id: 'original', label: 'Origineel' },
];

export function ReceiptScanner({ disabled, onScan }: { disabled: boolean; onScan: (file: File) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('capture');
  const [source, setSource] = useState<LoadedScanSource | null>(null);
  const [corners, setCorners] = useState<Quad | null>(null);
  const [adj, setAdj] = useState<ScanAdjustments>(DEFAULT_SCAN_ADJUSTMENTS);
  const [showFilters, setShowFilters] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pages, setPages] = useState<Blob[]>([]);
  const [processing, setProcessing] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [starting, setStarting] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const session = useRef(0);
  const renderToken = useRef(0);

  function stopCamera() {
    session.current += 1;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    setReady(false); setStarting(false);
  }

  function resetCurrentPage() {
    setSource(null); setCorners(null); setPhoto(null);
    setAdj(DEFAULT_SCAN_ADJUSTMENTS); setShowFilters(false);
    setMode('capture'); setError('');
  }

  useEffect(() => {
    if (!photo) { setPreview(null); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    return () => { session.current += 1; stream.current?.getTracks().forEach(track => track.stop()); };
  }, []);

  async function renderFrom(src: LoadedScanSource, quad: Quad, nextAdj: ScanAdjustments) {
    const token = ++renderToken.current;
    setProcessing(true); setError('');
    try {
      const blob = await renderScannedPage(src, quad, nextAdj);
      if (renderToken.current === token) setPhoto(blob);
    } catch {
      if (renderToken.current === token) setError('Scan verwerken mislukt. Pas de hoeken aan of probeer opnieuw.');
    } finally {
      if (renderToken.current === token) setProcessing(false);
    }
  }

  async function startCamera() {
    stopCamera(); resetCurrentPage(); setStarting(true);
    const current = session.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Gebruik een foto van je camera of fotobibliotheek.');
      const media = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 2560 } } });
      if (session.current !== current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const element = video.current;
      if (!element) { stopCamera(); return; }
      element.srcObject = media;
      await element.play();
      if (session.current === current) setReady(true);
    } catch (e) {
      if (session.current !== current) return;
      stopCamera();
      const denied = e instanceof DOMException && e.name === 'NotAllowedError';
      setError(denied ? 'Camera niet toegestaan. Je kunt ook een foto kiezen.' : 'Camera niet beschikbaar. Je kunt ook een foto kiezen.');
    } finally { if (session.current === current) setStarting(false); }
  }

  function close(value: boolean) {
    if (working) return;
    stopCamera(); setOpen(value); resetCurrentPage(); setPages([]);
  }

  async function capture() {
    const element = video.current;
    if (!element?.videoWidth || !element.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = element.videoWidth; canvas.height = element.videoHeight;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.drawImage(element, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
    if (!blob) { setError('Foto nemen mislukt.'); return; }
    stopCamera(); await useRaw(blob);
  }

  async function useRaw(raw: Blob) {
    setProcessing(true); setError('');
    try {
      const loaded = await loadScanSource(raw);
      setSource(loaded);
      setCorners(loaded.autoCorners);
      setAdj(DEFAULT_SCAN_ADJUSTMENTS);
      setMode('preview');
      await renderFrom(loaded, loaded.autoCorners, DEFAULT_SCAN_ADJUSTMENTS);
    } catch {
      setPhoto(raw);
      setMode('preview');
      setError('Automatisch bijsnijden niet gelukt; originele foto geladen.');
      setProcessing(false);
    }
  }

  function addPage() {
    if (!photo) return;
    setPages(p => [...p, photo]);
    resetCurrentPage();
    void startCamera();
  }

  function updateAdjustments(patch: Partial<ScanAdjustments>) {
    const next = { ...adj, ...patch };
    setAdj(next);
    if (source && corners) void renderFrom(source, corners, next);
  }

  function rotate() {
    const nextRot = ((adj.rotation + 90) % 360) as ScanAdjustments['rotation'];
    updateAdjustments({ rotation: nextRot });
  }

  function applyCrop() {
    setMode('preview');
    if (source && corners) void renderFrom(source, corners, adj);
  }

  async function scan() {
    const allPages = photo ? [...pages, photo] : pages;
    if (!allPages.length) return;
    setWorking(true); setError('');
    try {
      const success = await onScan(await pagesToPdf(allPages));
      if (success) { stopCamera(); setOpen(false); resetCurrentPage(); setPages([]); }
      else setError('Document niet ingelezen. Je foto blijft beschikbaar.');
    } catch { setError('Document niet ingelezen. Je foto blijft beschikbaar.'); }
    finally { setWorking(false); }
  }

  return <>
    <Button disabled={disabled} onClick={() => setOpen(true)}><ScanLine />Bonnetje scannen</Button>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-3 rounded-none p-4 sm:h-auto sm:max-h-[92dvh] sm:max-w-2xl sm:rounded-md" onEscapeKeyDown={e=>{if(working)e.preventDefault();}} onPointerDownOutside={e=>{if(working)e.preventDefault();}}>
        <DialogTitle className="pr-8 font-black uppercase tracking-normal">Document scannen</DialogTitle>
        <DialogDescription className="sr-only">Kasticket of aankoopfactuur scannen met randherkenning en filters</DialogDescription>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md border bg-muted sm:h-[440px] sm:flex-none">
          {mode === 'crop' && source && corners ? (
            <ScanCornerEditor source={source} corners={corners} onChange={setCorners} />
          ) : preview ? (
            <img src={preview} alt="Scanvoorbeeld" className="h-full w-full object-contain" />
          ) : <>
            <video ref={video} aria-label="Camerabeeld" muted autoPlay playsInline onLoadedData={()=>{if(stream.current)setReady(true);}} className="h-full w-full object-contain" />
            {!ready && <div className="absolute inset-0 flex items-center justify-center text-muted-foreground"><Camera className="size-16" strokeWidth={1}/></div>}
          </>}
        </div>
        {pages.length > 0 && (
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{pages.length} pagina{pages.length > 1 ? "'s" : ''} klaar{photo ? ` — dit is pagina ${pages.length + 1}` : ''}</span>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPages((p) => p.slice(0, -1))}><Trash2 className="mr-1 size-3.5" />Laatste pagina wissen</Button>
          </div>
        )}
        {mode === 'preview' && showFilters && source && (
          <div className="space-y-2 rounded-md border bg-card p-3">
            <div className="flex flex-wrap gap-1.5">
              {FILTER_LABELS.map((f) => (
                <Button key={f.id} type="button" size="sm" variant={adj.filter === f.id ? 'default' : 'outline'} disabled={processing || working} onClick={() => updateAdjustments({ filter: f.id })}>
                  {f.label}
                </Button>
              ))}
            </div>
            <div className="grid gap-3 pt-1 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span className="flex justify-between"><span>Helderheid</span><span className="font-mono">{adj.brightness > 0 ? `+${adj.brightness}` : adj.brightness}</span></span>
                <input type="range" min={-30} max={30} step={2} value={adj.brightness} onChange={(e) => updateAdjustments({ brightness: Number(e.target.value) })} className="w-full accent-primary" />
              </label>
              <label className="space-y-1 text-xs">
                <span className="flex justify-between"><span>Contrast</span><span className="font-mono">{adj.contrast > 0 ? `+${adj.contrast}` : adj.contrast}</span></span>
                <input type="range" min={-30} max={30} step={2} value={adj.contrast} onChange={(e) => updateAdjustments({ contrast: Number(e.target.value) })} className="w-full accent-primary" />
              </label>
            </div>
          </div>
        )}
        {processing && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 motion-safe:animate-spin"/>Document rechtzetten en verbeteren…</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {working && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 motion-safe:animate-spin"/>Document wordt uitgelezen…</p>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Scanfoto kiezen" className="hidden" onChange={e=>{const file=e.target.files?.[0]; if(file){stopCamera();void useRaw(file);} e.target.value='';}} />
        <div className="flex shrink-0 flex-wrap justify-center gap-2">
          {mode === 'crop' && source ? <>
            <Button variant="outline" onClick={() => setCorners(source.autoCorners)}>Auto-detectie</Button>
            <Button variant="outline" onClick={() => setCorners(fullFrameQuad(source.width, source.height))}>Volledig beeld</Button>
            <Button onClick={applyCrop}>Toepassen</Button>
          </> : photo ? <>
            <Button variant="outline" disabled={working} onClick={()=>{stopCamera();resetCurrentPage();}}><RefreshCw/>Opnieuw</Button>
            {source && <Button variant="outline" disabled={working || processing} onClick={()=>{setShowFilters(false);setMode('crop');}}><Crop/>Hoeken aanpassen</Button>}
            {source && <Button variant={showFilters ? 'secondary' : 'outline'} disabled={working || processing} onClick={()=>setShowFilters(v=>!v)}><SlidersHorizontal/>Filter</Button>}
            {source && <Button variant="outline" size="icon" title="Foto draaien" aria-label="Foto draaien" disabled={working || processing} onClick={rotate}><RotateCw/></Button>}
            <Button variant="outline" disabled={working || processing} onClick={addPage}><Plus/>Pagina toevoegen</Button>
            <Button disabled={working || processing} onClick={scan}><ScanLine/>Opslaan{pages.length?` (${pages.length+1})`:''}</Button>
          </> : <>
            {ready ? <Button className="h-12" onClick={capture}><Camera/>Foto nemen</Button> : <Button disabled={starting} className="h-12" onClick={startCamera}><Camera/>{starting?'Camera openen…':'Camera openen'}</Button>}
            <Button variant="outline" className="h-12" disabled={processing} onClick={()=>input.current?.click()}><ImagePlus/>Foto kiezen</Button>
            {pages.length > 0 && <Button className="h-12" disabled={working} onClick={scan}><ScanLine/>Opslaan ({pages.length})</Button>}
          </>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}