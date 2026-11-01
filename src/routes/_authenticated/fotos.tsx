import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Check, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { werkbonNr } from "@/lib/werkbon-number";
import { deliverFile } from "@/lib/file-download";
import { buildPhotoZip, fetchPhoto, prepareGroupDownload, type DownloadGroup, type PreparedFile } from "@/lib/photo-download";
import { photoFileName } from "@/lib/photo-naming";

export const Route = createFileRoute("/_authenticated/fotos")({
  head: () => ({ meta: [{ title: "Foto's — Riory Werkbonnen" }, { name: "description", content: "Alle werfoto's gesorteerd per interventie, te downloaden voor marketing." }, { property: "og:title", content: "Foto's — Riory Werkbonnen" }, { property: "og:description", content: "Alle werfoto's gesorteerd per interventie, te downloaden voor marketing." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Fotos,
});

type Group = DownloadGroup & { photos: { id: string; path: string; url: string | null }[] };

/** Above this many photos we ask first: the whole ZIP is built in the browser. */
const CONFIRM_ABOVE = 120;

function Fotos() {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [prepared, setPrepared] = useState<Record<string, PreparedFile>>({});
  const [busy, setBusy] = useState<{ key: string; done: number; total: number } | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["all_photos"],
    queryFn: async (): Promise<Group[]> => {
      const { data: rows, error } = await supabase.rpc("photo_overview");
      if (error) throw error;
      if (!rows?.length) return [];
      const { data: signed } = await supabase.storage.from("werkbon-fotos").createSignedUrls(rows.map((r) => r.path), 3600);
      const map = new Map<string, Group>();
      rows.forEach((r, i) => {
        const w = r;
        let g = map.get(r.work_order_id);
        if (!g) {
          g = { id: r.work_order_id, number: w?.number ?? null, customer: w?.customer_name ?? "Onbekend", city: w?.city ?? null, date: w?.scheduled_date ?? r.created_at.slice(0, 10), description: (w?.task_description ?? "").trim(), notes: (w?.work_notes ?? "").trim(), photos: [] };
          map.set(r.work_order_id, g);
        }
        g.photos.push({ id: r.id, path: r.path, url: signed?.[i]?.signedUrl ?? null });
      });
      return [...map.values()];
    },
  });

  const s = q.trim().toLowerCase();
  const groups = s ? data.filter((g) => `${g.number} ${g.customer} ${g.city} ${g.description} ${g.notes}`.toLowerCase().includes(s)) : data;
  const chosen = useMemo(() => groups.filter((g) => selected.has(g.id)), [groups, selected]);
  const chosenPhotos = chosen.reduce((sum, g) => sum + g.photos.length, 0);
  const SEL = "selectie";

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * A prepared file is handed over synchronously: iOS drops the download when the
   * click had to wait for the ZIP to be built first.
   */
  async function deliver(key: string, make: (onProgress: (done: number, total: number) => void) => Promise<PreparedFile>, count: number) {
    if (busy) return;
    const ready = prepared[key];
    if (ready) {
      void deliverFile(ready.blob, ready.filename);
      return;
    }
    if (count > CONFIRM_ABOVE && !confirm(`${count} foto's downloaden? De ZIP wordt hier opgebouwd; dat kan even duren.`)) return;
    setBusy({ key, done: 0, total: count });
    try {
      const file = await make((done, total) => setBusy({ key, done, total }));
      setPrepared((prev) => ({ ...prev, [key]: file }));
      await deliverFile(file.blob, file.filename);
      toast.success(`${file.filename} gedownload`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download mislukt");
    } finally {
      setBusy(null);
    }
  }

  const downloadGroup = (g: Group) => deliver(g.id, (onProgress) => prepareGroupDownload(g, onProgress), g.photos.length);
  const downloadSelection = () => deliver(SEL, (onProgress) => buildPhotoZip(chosen, onProgress), chosenPhotos);

  async function downloadOne(g: Group, index: number, path: string) {
    try {
      const blob = await fetchPhoto(path);
      await deliverFile(blob, photoFileName(g, index, path));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download mislukt");
    }
  }

  function downloadButton(key: string, label: string, onClick: () => void, disabled = false) {
    const isBusy = busy?.key === key;
    const isReady = !busy && !!prepared[key];
    return (
      <Button size="sm" variant={isReady ? "default" : "outline"} onClick={onClick} disabled={disabled || (!!busy && !isBusy)}>
        {isBusy ? <Loader2 className="animate-spin" /> : <Download />}
        {isBusy ? `Voorbereiden ${busy!.done}/${busy!.total}…` : isReady ? "Download" : label}
      </Button>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-black uppercase">Foto's</h1>
        <p className="text-sm text-muted-foreground">Kies interventies en download de foto's als ZIP, of download er één rechtstreeks.</p>
      </div>
      <Input placeholder="Zoek op klant, plaats, nummer of omschrijving" value={q} onChange={(e) => setQ(e.target.value)} />

      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {selected.size === 0 ? (
            <Button size="sm" variant="outline" onClick={() => setSelected(new Set(groups.map((g) => g.id)))}>
              <Check />
              Alles kiezen ({groups.length})
            </Button>
          ) : (
            <>
              <span className="rounded-md border bg-muted/40 px-3 py-1.5 text-sm font-bold">
                {selected.size} gekozen · {chosenPhotos} foto{chosenPhotos === 1 ? "" : "'s"}
              </span>
              {downloadButton(SEL, chosenPhotos > 0 ? "Download als ZIP" : "Kies eerst foto's", downloadSelection, chosenPhotos === 0)}
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Selectie wissen
              </Button>
            </>
          )}
        </div>
      )}

      {isLoading && <p className="text-muted-foreground">Laden…</p>}
      {!isLoading && groups.length === 0 && <p className="text-muted-foreground">Geen foto's gevonden.</p>}

      {groups.map((g) => (
        <section key={g.id} className="rounded-md border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-start gap-3">
            <Checkbox className="mt-1" checked={selected.has(g.id)} onCheckedChange={() => toggle(g.id)} aria-label={`${g.customer} kiezen`} />
            <Link to="/werkbonnen/$id" params={{ id: g.id }} className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-3 hover:underline">
              <span className="font-mono text-sm opacity-80">{werkbonNr(g.number)}</span>
              <span className="font-bold">{g.customer}</span>
              {g.city && <span className="text-sm text-muted-foreground">{g.city}</span>}
              {g.date && <span className="text-sm text-muted-foreground">{g.date}</span>}
              <span className="text-sm text-muted-foreground">· {g.photos.length} foto{g.photos.length === 1 ? "" : "'s"}</span>
            </Link>
            {downloadButton(g.id, "Foto's downloaden", () => downloadGroup(g))}
          </div>
          {busy?.key === g.id && <Progress className="mb-3 h-1" value={busy.total ? (busy.done / busy.total) * 100 : 0} />}
          {g.description && (
            <p className="mb-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{g.description}</p>
          )}
          {g.notes && (
            <p className="mb-3 whitespace-pre-line rounded border-l-4 border-primary bg-muted/40 p-2 text-sm leading-relaxed [overflow-wrap:anywhere]"><span className="font-bold">Technieker: </span>{g.notes}</p>
          )}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {g.photos.map((p, i) => p.url && (
              <div key={p.id} className="group relative">
                <a href={p.url} target="_blank" rel="noreferrer">
                  <img src={p.url} alt={`Foto ${g.customer}`} loading="lazy" className="aspect-square w-full rounded border object-cover" />
                </a>
                <button
                  type="button"
                  onClick={() => void downloadOne(g, i, p.path)}
                  aria-label={`Foto ${i + 1} van ${g.customer} downloaden`}
                  title="Deze foto downloaden"
                  className="absolute bottom-1 right-1 rounded-md border bg-background/90 p-1.5 shadow-sm transition-opacity hover:bg-background focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
