import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { PRODUCT_PHOTO_BUCKET, productPhotoPaths } from "@/lib/product-photos";

export function ProductPhotoGallery({ paths: storedPaths, title, urls }: { paths?: string[] | null; title: string; urls?: Record<string, string> }) {
  const paths = productPhotoPaths(storedPaths);
  const { data = {} } = useQuery({
    queryKey: ["product-photo-urls", paths], enabled: !urls && paths.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(PRODUCT_PHOTO_BUCKET).createSignedUrls(paths, 3600);
      if (error) throw error;
      return Object.fromEntries((data ?? []).flatMap(p => p.signedUrl ? [[p.path, p.signedUrl]] : [])) as Record<string, string>;
    }, staleTime: 1800000,
  });
  const images = urls ?? data;
  if (!paths.length) return null;
  return <div className="mt-2 flex flex-wrap gap-2">{paths.map((path, i) => images[path] && <a key={path} href={images[path]} target="_blank" rel="noreferrer" aria-label={`Foto ${i + 1} van ${title}`}><img src={images[path]} alt={`${title} — foto ${i + 1}`} className="h-28 w-36 rounded border bg-background object-contain" /></a>)}</div>;
}

export function ProductPhotoEditor({ value: storedPaths, onChange, title = "Product", disabled = false }: { value?: string[] | null; onChange: (paths: string[]) => void | Promise<void>; title?: string; disabled?: boolean }) {
  const value = productPhotoPaths(storedPaths);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  async function upload(files: FileList | File[] | null) {
    if (busy || disabled) return;
    if (!files?.length) return;
    setBusy(true);
    try {
      const added: string[] = [];
      for (const file of Array.from(files)) {
        if (!["image/jpeg", "image/png"].includes(file.type)) throw new Error("Gebruik JPG- of PNG-foto’s.");
        if (file.size > 5 * 1024 * 1024) throw new Error("Deze foto is te groot (maximaal 5 MB).");
        const path = `${crypto.randomUUID()}.${file.type === "image/png" ? "png" : "jpg"}`;
        const { error } = await supabase.storage.from(PRODUCT_PHOTO_BUCKET).upload(path, file, { contentType: file.type });
        if (error) throw error;
        added.push(path);
      }
      await onChange([...value, ...added]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Foto toevoegen mislukt"); }
    finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  return <div className={`w-full space-y-2 rounded-md border-2 border-dashed p-3 ${dragging ? "border-primary bg-accent" : "border-border"}`}
    aria-label={`Foto’s slepen bij ${title}`}
    onDragOver={e => { e.preventDefault(); if (!busy && !disabled) { e.dataTransfer.dropEffect = "copy"; setDragging(true); } }}
    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={e => { e.preventDefault(); setDragging(false); void upload(Array.from(e.dataTransfer.files)); }}>
    <input ref={input} type="file" accept="image/jpeg,image/png" multiple className="hidden" aria-label={`Foto’s toevoegen bij ${title}`} onChange={e => void upload(e.target.files)} />
    <Button type="button" variant="outline" size="sm" disabled={busy || disabled} onClick={() => input.current?.click()}><ImagePlus className="mr-2 h-4 w-4" />{busy ? "Foto’s laden…" : "Foto’s toevoegen"}</Button>
    <span className="ml-2 text-sm text-muted-foreground">{dragging ? "Foto’s hier neerzetten" : "of foto’s hierheen slepen"}</span>
    {value.map((path, i) => <div key={path} className="flex items-center gap-2"><ProductPhotoGallery paths={[path]} title={title} /><Button type="button" variant="outline" size="icon" disabled={busy || disabled} aria-label={`Foto ${i + 1} verwijderen bij ${title}`} title="Foto verwijderen" onClick={() => void onChange(value.filter(p => p !== path))}><X className="h-4 w-4" /></Button></div>)}
  </div>;
}