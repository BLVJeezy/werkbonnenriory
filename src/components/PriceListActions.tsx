import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { euro } from "@/lib/billing";
import { priceListPdf, sendPriceList } from "@/lib/quotes.functions";

type Item = { id: string; label: string; price: string };

function Checklist({ title, items, sel, setSel }: { title: string; items: Item[]; sel: Set<string>; setSel: (s: Set<string>) => void }) {
  const [q, setQ] = useState("");
  const n = q.trim().toLowerCase();
  const shown = n ? items.filter((i) => i.label.toLowerCase().includes(n)) : items;
  const toggle = (id: string) => { const s = new Set(sel); if (s.has(id)) s.delete(id); else s.add(id); setSel(s); };
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{title} ({sel.size}/{items.length})</span>
        <Button type="button" size="sm" variant="ghost" onClick={() => setSel(new Set([...sel, ...shown.map((i) => i.id)]))}>Alles aan</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { const s = new Set(sel); shown.forEach((i) => s.delete(i.id)); setSel(s); }}>Alles uit</Button>
      </div>
      <Input type="search" aria-label={`${title} zoeken`} placeholder="Zoeken…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="max-h-60 overflow-y-auto rounded border">
        {shown.map((i) => (
          <label key={i.id} className="flex cursor-pointer items-center gap-2 border-b px-2 py-1.5 text-sm last:border-b-0">
            <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} />
            <span className="min-w-0 flex-1 break-words">{i.label}</span>
            <span className="shrink-0 text-muted-foreground">{i.price}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Prijslijst in huisstijl met aangevinkte producten/activiteiten downloaden of mailen (vanuit info@riory.be). */
export function PriceListActions() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"pdf" | "mail" | null>(null);
  const [prodSel, setProdSel] = useState<Set<string>>(new Set());
  const [actSel, setActSel] = useState<Set<string>>(new Set());
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: async () => (await supabase.from("products").select("*").order("name")).data ?? [] });
  const { data: activities = [] } = useQuery({ queryKey: ["activities"], queryFn: async () => (await supabase.from("activities").select("*").order("name")).data ?? [] });
  const sel = { productIds: [...prodSel], activityIds: [...actSel] };
  const none = !prodSel.size && !actSel.size;
  async function download() {
    setBusy("pdf");
    try {
      const { name, base64 } = await priceListPdf({ data: sel });
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }
  async function mail(e: React.FormEvent) {
    e.preventDefault();
    setBusy("mail");
    try { await sendPriceList({ data: { ...sel, email } }); toast.success(`Prijslijst gemaild naar ${email}`); setEmail(""); }
    catch (err) { toast.error((err as Error).message); } finally { setBusy(null); }
  }
  return (
    <section className="space-y-3 rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold">Prijslijst</h2>
          <p className="text-sm text-muted-foreground">Vink producten en activiteiten aan; PDF in Riory-huisstijl, prijzen excl. btw.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setOpen(!open)}>{open ? "Sluiten" : "Prijslijst maken"}</Button>
      </div>
      {open && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Checklist title="Activiteiten" items={activities.filter((a) => a.hourly_rate != null).map((a) => ({ id: a.id, label: a.name, price: `${euro(Number(a.hourly_rate))}/u` }))} sel={actSel} setSel={setActSel} />
            <Checklist title="Producten" items={products.map((p) => ({ id: p.id, label: p.name, price: euro(Number(p.price)) }))} sel={prodSel} setSel={setProdSel} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="button" onClick={download} disabled={busy !== null || none}>{busy === "pdf" ? "Bezig…" : "Downloaden"}</Button>
            <form onSubmit={mail} className="flex min-w-0 flex-1 gap-2">
              <Input type="email" required aria-label="E-mailadres klant" placeholder="E-mailadres klant" value={email} onChange={(e) => setEmail(e.target.value)} className="min-w-0" />
              <Button type="submit" variant="outline" disabled={busy !== null || !email || none}>{busy === "mail" ? "Versturen…" : "Mailen"}</Button>
            </form>
          </div>
        </>
      )}
    </section>
  );
}
