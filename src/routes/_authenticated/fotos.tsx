import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/fotos")({
  head: () => ({ meta: [{ title: "Foto's — Riory Werkbonnen" }, { name: "description", content: "Alle werfoto's gesorteerd per interventie." }, { property: "og:title", content: "Foto's — Riory Werkbonnen" }, { property: "og:description", content: "Alle werfoto's gesorteerd per interventie." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Fotos,
});

type Group = { id: string; number: number | null; customer: string; city: string | null; date: string | null; description: string; photos: { id: string; url: string | null }[] };

function Fotos() {
  const [q, setQ] = useState("");
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
          g = { id: r.work_order_id, number: w?.number ?? null, customer: w?.customer_name ?? "Onbekend", city: w?.city ?? null, date: w?.scheduled_date ?? r.created_at.slice(0, 10), description: (w?.task_description ?? "").trim(), photos: [] };
          map.set(r.work_order_id, g);
        }
        g.photos.push({ id: r.id, url: signed?.[i]?.signedUrl ?? null });
      });
      return [...map.values()];
    },
  });
  const s = q.trim().toLowerCase();
  const groups = s ? data.filter((g) => `${g.number} ${g.customer} ${g.city} ${g.description}`.toLowerCase().includes(s)) : data;
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-black uppercase">Foto's</h1>
      <Input placeholder="Zoek op klant, plaats of nummer" value={q} onChange={(e) => setQ(e.target.value)} />
      {isLoading && <p className="text-muted-foreground">Laden…</p>}
      {!isLoading && groups.length === 0 && <p className="text-muted-foreground">Geen foto's gevonden.</p>}
      {groups.map((g) => (
        <section key={g.id} className="rounded-md border bg-card p-4">
          <Link to="/werkbonnen/$id" params={{ id: g.id }} className="mb-3 flex flex-wrap items-baseline gap-x-3 hover:underline">
            <span className="font-mono text-sm opacity-80">#{g.number}</span>
            <span className="font-bold">{g.customer}</span>
            {g.city && <span className="text-sm text-muted-foreground">{g.city}</span>}
            {g.date && <span className="text-sm text-muted-foreground">{g.date}</span>}
            <span className="text-sm text-muted-foreground">· {g.photos.length} foto{g.photos.length === 1 ? "" : "'s"}</span>
          </Link>
          {g.description && (
            <p className="mb-3 whitespace-pre-line text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{g.description}</p>
          )}
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {g.photos.map((p) => p.url && (
              <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                <img src={p.url} alt={`Foto ${g.customer}`} loading="lazy" className="aspect-square w-full rounded border object-cover" />
              </a>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
