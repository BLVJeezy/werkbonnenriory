import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, RotateCw, ScanLine, RefreshCw, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

export function ReceiptScanner({ disabled, onScan }: { disabled: boolean; onScan: (file: File) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [starting, setStarting] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const session = useRef(0);

  function stopCamera() {
    session.current += 1;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    setReady(false); setStarting(false);
  }

  useEffect(() => {
    if (!photo) { setPreview(null); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    return () => { session.current += 1; stream.current?.getTracks().forEach(track => track.stop()); };
  }, []);

  async function startCamera() {
    stopCamera(); setPhoto(null); setError(''); setStarting(true);
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
    stopCamera(); setOpen(value); setPhoto(null); setError('');
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
    stopCamera(); setPhoto(new File([blob], 'scan.jpg', { type: 'image/jpeg' }));
  }

  async function rotate() {
    if (!preview || !photo) return;
    setWorking(true);
    try {
      const image = new Image(); image.src = preview; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.height; canvas.height = image.width;
      const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Draaien mislukt.');
      ctx.translate(canvas.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(image, 0, 0);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
      if (!blob) throw new Error('Draaien mislukt.');
      setPhoto(new File([blob], 'scan.jpg', {type:'image/jpeg'}));
    } catch { setError('Foto draaien mislukt.'); } finally { setWorking(false); }
  }

  async function scan() {
    if (!photo) return; setWorking(true); setError('');
    try {
      const success = await onScan(photo);
      if (success) { stopCamera(); setOpen(false); setPhoto(null); }
      else setError('Document niet ingelezen. Je foto blijft beschikbaar.');
    } catch { setError('Document niet ingelezen. Je foto blijft beschikbaar.'); }
    finally { setWorking(false); }
  }

  return <>
    <Button disabled={disabled} onClick={() => setOpen(true)}><ScanLine />Bonnetje scannen</Button>
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-full flex-col gap-3 rounded-none p-4 sm:h-auto sm:max-h-[90dvh] sm:max-w-xl sm:rounded-md" onEscapeKeyDown={e=>{if(working)e.preventDefault();}} onPointerDownOutside={e=>{if(working)e.preventDefault();}}>
        <DialogTitle className="pr-8 font-black uppercase tracking-normal">Document scannen</DialogTitle>
        <DialogDescription className="sr-only">Kasticket of aankoopfactuur</DialogDescription>
        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden border bg-muted sm:h-[420px] sm:flex-none">
          {preview ? <img src={preview} alt="Scanvoorbeeld" className="h-full w-full object-contain" /> : <>
            <video ref={video} aria-label="Camerabeeld" muted autoPlay playsInline onLoadedData={()=>{if(stream.current)setReady(true);}} className="h-full w-full object-contain" />
            {!ready && <div className="absolute inset-0 flex items-center justify-center text-muted-foreground"><Camera className="size-16" strokeWidth={1}/></div>}
          </>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {working && <p role="status" className="flex items-center gap-2 text-sm"><LoaderCircle className="size-4 motion-safe:animate-spin"/>Document wordt uitgelezen…</p>}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Scanfoto kiezen" className="hidden" onChange={e=>{const file=e.target.files?.[0]; if(file){stopCamera();setPhoto(file);setError('');} e.target.value='';}} />
        <div className="flex shrink-0 flex-wrap justify-center gap-2">
          {photo ? <>
            <Button variant="outline" disabled={working} onClick={()=>{stopCamera();setPhoto(null);setError('');}}><RefreshCw/>Opnieuw</Button>
            <Button variant="outline" size="icon" title="Foto draaien" aria-label="Foto draaien" disabled={working} onClick={rotate}><RotateCw/></Button>
            <Button disabled={working} onClick={scan}><ScanLine/>Uitlezen</Button>
          </> : <>
            {ready ? <Button className="h-12" onClick={capture}><Camera/>Foto nemen</Button> : <Button disabled={starting} className="h-12" onClick={startCamera}><Camera/>{starting?'Camera openen…':'Camera openen'}</Button>}
            <Button variant="outline" className="h-12" onClick={()=>input.current?.click()}><ImagePlus/>Foto kiezen</Button>
          </>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}