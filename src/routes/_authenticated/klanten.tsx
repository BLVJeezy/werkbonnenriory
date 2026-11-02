import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { SortTh, Th, tableCls, tableWrap, useSort } from "@/components/SortTable";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAddress } from "@/lib/address";
import { allCustomers, customerKey, customerPatch, rowsToCustomers, type CustomerRow } from "@/lib/customers";
import { filterChoices } from "@/lib/choice-search";

export const Route = createFileRoute("/_authenticated/klanten")({
  head: () => ({ meta: [{ title: "Klanten — Riory Werkbonnen" }, { name: "description", content: "Opgeslagen klanten van Riory, met Excel-import." }, { property: "og:title", content: "Klanten — Riory Werkbonnen" }, { property: "og:description", content: "Opgeslagen klanten van Riory, met Excel-import." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Klanten,
});

const FIELDS: { key: keyof CustomerRow; label: string; className: string }[] = [
  { key: "name", label: "Naam", className: "min-w-48 flex-1" },
  { key: "street", label: "Straat", className: "min-w-40 flex-[2]" },
  { key: "house_number", label: "Nr.", className: "w-24" },
  { key: "postal_code", label: "Postcode", className: "w-32" },
  { key: "city", label: "Plaats", className: "min-w-36 flex-1" },
  { key: "phone", label: "Telefoon", className: "w-40" },
  { key: "email", label: "E-mail", className: "min-w-44 flex-1" },
  { key: "billing_email", label: "E-mail facturatie", className: "min-w-44 flex-1" },
  { key: "vat_number", label: "Btw-nummer", className: "w-44" },
  { key: "project_name", label: "Projectnaam", className: "min-w-36 flex-1" },
];

function Klanten() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => allCustomers(supabase),
  });
  const {data:projects=[]}=useQuery({queryKey:['customer_projects'],queryFn:async()=>{const {data,error}=await supabase.from('customer_projects').select('*').order('name');if(error)throw error;return data??[];}});
  const matchingIds = new Set(filterChoices(data.map(c => ({ value: c.id, label: c.name, search: [c.customer_number, ...(c.customer_numbers ?? []), c.street, c.house_number, c.postal_code, c.city, c.email, c.billing_email, c.phone, c.vat_number].filter(Boolean).join(' ') })), q).map(c => c.value));
  const rows = data.filter(c => matchingIds.has(c.id));
  const sort = useSort(rows, { nr: c => c.customer_number, naam: c => c.name, plaats: c => c.city, tel: c => c.phone, mail: c => c.email, btw: c => c.vat_number });

  function openEdit(c: (typeof data)[number]) {
    setEditing(editing === c.id ? null : c.id);
    setForm({ ...Object.fromEntries(FIELDS.map((f) => [f.key, (c[f.key] as string | null) ?? ""])), vrij_beroep: c.vrij_beroep ? "1" : "", oud6: Number(c.default_vat_rate) === 6 ? "1" : "" });
  }

  async function save(c: (typeof data)[number]) {
    const patch = { ...customerPatch(form as Partial<CustomerRow>), vrij_beroep: form["vrij_beroep"] === "1", default_vat_rate: form["oud6"] === "1" ? 6 : (Number(c.default_vat_rate) === 6 ? null : c.default_vat_rate) };
    if (!patch.name) {
      toast.error("De naam mag niet leeg zijn.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("customers").update(patch).eq("id", c.id);
    setSaving(false);
    if (error) {
      toast.error(error.code === "23505" ? "Er bestaat al een klant met deze naam en adres." : error.message);
      return;
    }
    toast.success(`${patch.name} bijgewerkt`);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  async function importExcel(file: File) {
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const first = wb.SheetNames[0];
      const sheet = first ? wb.Sheets[first] : undefined;
      if(!sheet) throw new Error('Geen werkblad gevonden');
      const parsed = rowsToCustomers(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }));
      const unique = [...new Map(parsed.map((c) => [customerKey(c), c])).values()];
      if (!unique.length) {
        toast.error("Geen klanten gevonden. Zorg voor een kolom 'Naam'.");
        return;
      }
      const { error } = await supabase.from("customers").upsert(unique, { onConflict: "identity_key" });
      if (error) throw error;
      toast.success(`${unique.length} klant(en) ingelezen`);
      qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Inlezen mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-3xl font-black uppercase">Klanten</h1>
        <label className="ml-auto">
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importExcel(f); }} />
          <Button asChild variant="outline"><span>{busy ? "Inlezen…" : "Excel inlezen"}</span></Button>
        </label>
      </div>
      <Input type="search" aria-label="Klanten zoeken" placeholder="Zoek klantnummer, naam of adres…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className={tableWrap}>
        <table className={tableCls}>
          <thead><tr>
            <SortTh k="nr" sort={sort} className="w-px">Nr.</SortTh>
            <SortTh k="naam" sort={sort}>Naam</SortTh>
            <SortTh k="plaats" sort={sort} className="hidden md:table-cell">Adres</SortTh>
            <SortTh k="tel" sort={sort} className="hidden lg:table-cell">Telefoon</SortTh>
            <SortTh k="mail" sort={sort} className="hidden 2xl:table-cell">E-mail</SortTh>
            <SortTh k="btw" sort={sort} className="hidden 2xl:table-cell">Btw-nummer</SortTh>
            <Th />
          </tr></thead>
          <tbody>
            {sort.sorted.length === 0 && <tr><td colSpan={7} className="text-muted-foreground">Geen klanten.</td></tr>}
            {sort.sorted.map((c) => {
              const own = projects.filter(p => p.customer_id === c.id);
              return (
                <Fragment key={c.id}>
                  <tr>
                    <td className="max-w-24 truncate font-mono text-xs text-muted-foreground" title={c.customer_number ?? ""}>{c.customer_number}</td>
                    <td className="font-bold">{c.name}{own.length > 0 && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-xs">{own.length} project{own.length > 1 ? "en" : ""}</span>}{Number(c.default_vat_rate) === 6 && !c.vrij_beroep && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-normal">6% btw</span>}{c.vrij_beroep && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-normal">vrij beroep</span>}<div className="text-xs font-normal text-muted-foreground md:hidden">{formatAddress(c)}</div></td>
                    <td className="hidden text-muted-foreground md:table-cell">{formatAddress(c) || "—"}</td>
                    <td className="hidden whitespace-nowrap lg:table-cell">{c.phone ?? "—"}</td>
                    <td className="hidden max-w-56 truncate 2xl:table-cell" title={c.email ?? ""}>{c.email ?? "—"}</td>
                    <td className="hidden whitespace-nowrap font-mono text-xs 2xl:table-cell">{c.vat_number ?? "—"}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>{editing === c.id ? "Sluiten" : "Details"}</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                        if (!confirm(`${c.name} verwijderen uit klanten?`)) return;
                        await supabase.from("customers").delete().eq("id", c.id);
                        qc.invalidateQueries({ queryKey: ["customers"] });
                      }}>Verwijderen</Button>
                    </td>
                  </tr>
                  {editing === c.id && (
                    <tr className="bg-muted/30"><td colSpan={7}>
                      <div className="space-y-2">
                        {c.customer_numbers?.length > 1 && <div className="text-xs text-muted-foreground">Klantnummers: {c.customer_numbers.join(', ')}</div>}
                        {own.map(p => <div key={p.id} className="border-l-2 border-primary pl-3 text-sm"><span className="font-mono text-muted-foreground">{p.number} </span><strong>{p.name}</strong><div className="text-muted-foreground">{formatAddress(p)}</div></div>)}
                        <div className="flex flex-wrap gap-2">
                          {FIELDS.map((f) => (
                            <label key={f.key} className={`space-y-1 ${f.className}`}>
                              <span className="block text-xs font-bold uppercase text-muted-foreground">{f.label}</span>
                              <Input value={form[f.key] ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.label} />
                            </label>
                          ))}
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" className="h-4 w-4 accent-primary" checked={form["vrij_beroep"] === "1"} onChange={(e) => setForm((prev) => ({ ...prev, vrij_beroep: e.target.checked ? "1" : "" }))} />
                          Vrij beroep — altijd 21% btw, ook met een btw-nummer
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" className="h-4 w-4 accent-primary" checked={form["oud6"] === "1"} onChange={(e) => setForm((prev) => ({ ...prev, oud6: e.target.checked ? "1" : "" }))} />
                          Particulier, woning ouder dan 10 jaar — 6% btw
                        </label>
                        <div className="flex gap-2">
                          <Button size="sm" disabled={saving} onClick={() => save(c)}>{saving ? "Bezig…" : "Opslaan"}</Button>
                          <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(null)}>Annuleren</Button>
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
