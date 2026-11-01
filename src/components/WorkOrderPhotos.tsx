import { compressImage } from "@/lib/compress-image";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const BUCKET = "werkbon-fotos";

/** Photos on a work order; files live under `<work_order_id>/` in a private bucket and show via signed URLs. */
export function WorkOrderPhotos({ workOrderId, locked }: { workOrderId: string; locked: boolean }) {
  const qc = useQueryClient();
  const key = ["work_order_photos", workOrderId];
  const [busy, setBusy] = useState(false);
  const { data = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data: rows } = await supabase.from("work_order_photos").select("*").eq("work_order_id", workOrderId).order("created_at");
      if (!rows?.length) return [];
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(rows.map((r) => r.path), 3600);
      return rows.map((r, i) => ({ ...r, url: signed?.[i]?.signedUrl ?? null }));
    },
  });

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    for (const original of Array.from(files)) {
      const f = await compressImage(original);
      const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${workOrderId}/${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || "image/jpeg" });
      if (up.error) {
        toast.error(`Foto uploaden mislukt: ${up.error.message}`);
        continue;
      }
      const { error } = await supabase.from("work_order_photos").insert({ work_order_id: workOrderId, path });
      if (error) toast.error(error.message);
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: key });
  }

  async function remove(id: string, path: string) {
    if (!confirm("Foto verwijderen?")) return;
    await supabase.storage.from(BUCKET).remove([path]);
    await supabase.from("work_order_photos").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: key });
  }

  return (
    <section className="rounded-md border bg-card p-4">
      <h2 className="mb-3 text-lg font-black uppercase">Foto's</h2>
      {data.length === 0 && <p className="mb-3 text-muted-foreground">Nog geen foto's.</p>}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {data.map((p) => (
          <div key={p.id} className="relative">
            {p.url && (
              <a href={p.url} target="_blank" rel="noreferrer">
                <img src={p.url} alt="Foto werkbon" className="aspect-square w-full rounded border object-cover" />
              </a>
            )}
            {!locked && (
              <Button size="sm" variant="destructive" className="absolute right-1 top-1 h-7 px-2" onClick={() => remove(p.id, p.path)}>
                ✕
              </Button>
            )}
          </div>
        ))}
      </div>
      {!locked && (
        <Button asChild variant="outline" disabled={busy}>
          <label className="cursor-pointer">
            {busy ? "Uploaden…" : "+ Foto toevoegen"}
            <input type="file" accept="image/*" multiple className="hidden" disabled={busy} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </label>
        </Button>
      )}
    </section>
  );
}
