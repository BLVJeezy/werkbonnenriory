import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { SortTh, Th, tableCls, tableWrap, useSort } from "@/components/SortTable";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { euro } from "@/lib/billing";
import { PriceListActions } from "@/components/PriceListActions";
import { ProductPhotoEditor, ProductPhotoGallery } from "@/components/ProductPhotos";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/producten")({
  head: () => ({ meta: [{ title: "Producten — Riory Werkbonnen" }, { name: "description", content: "Beheer de producten en materialen voor Riory-werkbonnen." }, { property: "og:title", content: "Producten — Riory Werkbonnen" }, { property: "og:description", content: "Beheer de producten en materialen voor Riory-werkbonnen." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Producten,
});

function Producten() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("st");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [alias, setAlias] = useState("");
  const [adminOnly, setAdminOnly] = useState(false);
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editAlias, setEditAlias] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => (await supabase.from("products").select("*").order("name")).data ?? [],
  });
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const visible = needle ? data.filter((p) => [p.name, p.alias, p.description].some((v) => v?.toLowerCase().includes(needle))) : data;
  const sort = useSort(visible, { naam: (p) => p.name, alias: (p) => p.alias, eenheid: (p) => p.unit, prijs: (p) => Number(p.price), admin: (p) => (p.admin_only ? 1 : 0) }, "naam");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("products").insert({ name, unit: unit || "st", price: Number(price) || 0, description, alias: alias.trim() || null, admin_only: adminOnly, photo_paths: photoPaths });
    if (error) {
      toast.error(error.message);
      return;
    }
    setName("");
    setUnit("st");
    setPrice("");
    setDescription("");
    setAlias("");
    setAdminOnly(false);
    setPhotoPaths([]);
    qc.invalidateQueries({ queryKey: ["products"] });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Producten"
        subtitle="Beheer materialen, prijzen, aliassen voor ploegen en productfoto’s."
        badge={<Badge variant="secondary" className="font-mono">{visible.length} / {data.length}</Badge>}
        actions={<PriceListActions />}
      />

      <form onSubmit={add} className="space-y-3 rounded-xl border border-border/90 bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
          <h2 className="text-sm font-bold text-foreground">Nieuw product toevoegen</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_110px_150px]">
          <Input placeholder="Productnaam" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Alias voor ploegen (bv. 'grijze buis')" value={alias} onChange={(e) => setAlias(e.target.value)} />
          <Input placeholder="Eenheid" value={unit} onChange={(e) => setUnit(e.target.value)} />
          <Input placeholder="Prijs € excl. btw" type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <Textarea placeholder="Lange omschrijving (optioneel)" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20 w-full" />
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-4">
            <ProductPhotoEditor value={photoPaths} onChange={setPhotoPaths} title="nieuw product" />
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={adminOnly} onChange={(e) => setAdminOnly(e.target.checked)} />
              Enkel voor beheerder
            </label>
          </div>
          <Button>Product toevoegen</Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/90 bg-card p-3.5 shadow-xs">
        <Input type="search" aria-label="Producten zoeken" placeholder="Zoek op productnaam, alias of omschrijving…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-md" />
        <span className="text-xs text-muted-foreground">{visible.length} resultaten</span>
      </div>
      <div className={tableWrap}>
        <table className={tableCls}>
          <thead><tr>
            <SortTh k="naam" sort={sort}>Product</SortTh>
            <SortTh k="alias" sort={sort} className="hidden md:table-cell">Alias</SortTh>
            <SortTh k="eenheid" sort={sort} className="hidden sm:table-cell">Eenh.</SortTh>
            <SortTh k="prijs" sort={sort} right>Prijs</SortTh>
            <SortTh k="admin" sort={sort}>Enkel beheerder</SortTh>
            <Th />
          </tr></thead>
          <tbody>
            {sort.sorted.length === 0 && <tr><td colSpan={6} className="text-muted-foreground">Geen producten.</td></tr>}
            {sort.sorted.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td className="font-bold">{p.name}{p.alias && <div className="text-xs font-normal text-muted-foreground md:hidden">Alias: {p.alias}</div>}<ProductPhotoGallery paths={p.photo_paths} title={p.name} /></td>
                  <td className="hidden text-muted-foreground md:table-cell">{p.alias ?? "—"}</td>
                  <td className="hidden font-mono text-xs sm:table-cell">{p.unit}</td>
                  <td className="whitespace-nowrap text-right font-mono">{euro(Number(p.price))}</td>
                  <td>
                    <input type="checkbox" aria-label={`${p.name} enkel voor beheerder`} className="h-5 w-5 accent-primary" checked={p.admin_only} onChange={async (e) => {
                      await supabase.from("products").update({ admin_only: e.target.checked }).eq("id", p.id);
                      qc.invalidateQueries({ queryKey: ["products"] });
                    }} />
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="sm" onClick={() => {
                      if (editing === p.id) setEditing(null);
                      else { setEditing(p.id); setEditText(p.description ?? ""); setEditAlias(p.alias ?? ""); }
                    }}>{editing === p.id ? "Sluiten" : "Details"}</Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={async () => {
                      if (!confirm(`${p.name} verwijderen?`)) return;
                      await supabase.from("products").delete().eq("id", p.id);
                      qc.invalidateQueries({ queryKey: ["products"] });
                    }}>Verwijderen</Button>
                  </td>
                </tr>
                {editing === p.id && (
                  <tr className="bg-muted/30"><td colSpan={6}>
                    <div className="space-y-2">
                      <Input value={editAlias} onChange={(e) => setEditAlias(e.target.value)} placeholder="Alias voor ploegen" />
                      <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} className="min-h-28" placeholder="Lange omschrijving" />
                      <ProductPhotoEditor value={p.photo_paths} title={p.name} onChange={async paths => {
                        const { error } = await supabase.from("products").update({ photo_paths: paths }).eq("id", p.id);
                        if (error) throw new Error(error.message);
                        await qc.invalidateQueries({ queryKey: ["products"] });
                      }} />
                      <Button size="sm" onClick={async () => {
                        const { error } = await supabase.from("products").update({ description: editText, alias: editAlias.trim() || null }).eq("id", p.id);
                        if (error) toast.error(error.message);
                        setEditing(null);
                        qc.invalidateQueries({ queryKey: ["products"] });
                      }}>Opslaan</Button>
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
