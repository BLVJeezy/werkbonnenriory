import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const BUCKET = "werkbon-fotos";

/** Choose photos for an insurance estimate: earlier photos taken at this customer, plus new uploads. Order = order in the PDF. */
export function InsurancePhotoPicker({ customerId, value, onChange }: { customerId: string | null; value: string[]; onChange: (paths: string[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const { data: customerPhotos = [] } = useQuery({
    queryKey: ["customer_photos", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data } = await supabase.from("work_order_photos")
        .select("path, created_at, work_orders!inner(customer_id, number)")
        .eq("work_orders.customer_id", customerId!)
        .order("created_at", { ascending: false }).limit(200);
      return (data ?? []).map((r) => ({ path: r.path, date: r.created_at.slice(0, 10), nr: (r.work_orders as { number: number | null }).number }));
    },
  });
  const allPaths = [...new Set([...value, ...customerPhotos.map((p) => p.path)])];
  const { data: urls = {} } = useQuery({
    queryKey: ["photo_urls", allPaths.join("|")],
    enabled: allPaths.length > 0,
    queryFn: async () => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(allPaths, 3600);
      return Object.fromEntries((data ?? []).map((d) => [d.path, d.signedUrl]));
    },
  });
  const toggle = (p: string) => onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const added: string[] = [];
    for (const f of Array.from(files)) {
      if (!/^image\/(jpeg|png)$/.test(f.type)) { toast.error(`${f.name}: gebruik JPG of PNG`); continue; }
      const path = `bestek/${crypto.randomUUID()}.${f.type === "image/png" ? "png" : "jpg"}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type });
      if (error) toast.error(`${f.name} uploaden mislukt`); else added.push(path);
    }
    onChange([...value, ...added]);
    setUploading(false);
  }

  const extra = value.filter((p) => !customerPhotos.some((c) => c.path === p));
  const tile = (p: string, label: string) => {
    const idx = value.indexOf(p);
    return (
      <button type="button" key={p} onClick={() => toggle(p)} className={`relative overflow-hidden rounded-md border-2 text-left ${idx >= 0 ? "border-primary" : "border-transparent opacity-70"}`}>
        {urls[p] ? <img src={urls[p]} alt={label} className="h-24 w-full object-cover" /> : <div className="h-24 w-full bg-muted" />}
        <span className="block truncate bg-card px-1 text-xs">{label}</span>
        {idx >= 0 && <span className="absolute left-1 top-1 rounded bg-primary px-1.5 text-xs font-bold text-primary-foreground">{idx + 1}</span>}
      </button>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{value.length} foto’s gekozen · klik om (de)selecteren, het nummer is de volgorde in het bestek</span>
        <Button asChild type="button" size="sm" variant="outline" className="ml-auto">
          <label className="cursor-pointer">{uploading ? "Uploaden…" : "+ Foto’s uploaden"}<input type="file" accept="image/jpeg,image/png" multiple className="hidden" disabled={uploading} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} /></label>
        </Button>
      </div>
      {!customerId && <p className="text-xs text-muted-foreground">Kies eerst een klant om foto’s van eerdere interventies te zien.</p>}
      {(extra.length > 0 || customerPhotos.length > 0) && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-6">
          {extra.map((p) => tile(p, "Geüpload"))}
          {customerPhotos.map((c) => tile(c.path, `${c.nr ? `#${c.nr} · ` : ""}${c.date}`))}
        </div>
      )}
      {customerId && customerPhotos.length === 0 && <p className="text-xs text-muted-foreground">Nog geen foto’s bij deze klant.</p>}
    </div>
  );
}
