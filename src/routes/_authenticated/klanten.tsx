import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { SortTh, Th, tableCls, tableWrap, useSort } from "@/components/SortTable";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAddress } from "@/lib/address";
import { allCustomers, customerKey, customerPatch, rowsToCustomers, type CustomerRow } from "@/lib/customers";
import { filterChoices } from "@/lib/choice-search";
import { syndicusDetailsPatch, syndicusLabel, syndicusSuggestions, type SyndicusDetailField, type SyndicusDetails } from "@/lib/syndicus";

export const Route = createFileRoute("/_authenticated/klanten")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => (typeof search.q === "string" && search.q ? { q: search.q } : {}),
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

const SYNDICUS_FIELDS: { key: SyndicusDetailField; label: string; className: string }[] = [
  { key: "syndicus_company", label: "Bedrijfsnaam", className: "min-w-48 flex-[2]" },
  { key: "syndicus_contact", label: "Contactpersoon", className: "min-w-40 flex-1" },
  { key: "syndicus_vat_number", label: "Btw-nummer", className: "w-44" },
  { key: "syndicus_street", label: "Straat", className: "min-w-40 flex-[2]" },
  { key: "syndicus_house_number", label: "Nr.", className: "w-24" },
  { key: "syndicus_postal_code", label: "Postcode", className: "w-32" },
  { key: "syndicus_city", label: "Plaats", className: "min-w-36 flex-1" },
  { key: "syndicus_phone", label: "Telefoon", className: "w-40" },
  { key: "syndicus_email", label: "E-mail", className: "min-w-44 flex-1" },
  { key: "syndicus_billing_email", label: "E-mail boekhouding", className: "min-w-44 flex-1" },
];

function Klanten() {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const [q, setQ] = useState(search.q ?? "");
  useEffect(() => setQ(search.q ?? ""), [search.q]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTemplate, setAssignTemplate] = useState("");
  const [assignCompany, setAssignCompany] = useState("");
  const [assignContact, setAssignContact] = useState("");
  const [assigning, setAssigning] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => allCustomers(supabase),
  });
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: async () => (await supabase.from("branches").select("*").order("name")).data ?? [] });
  const branchName = (id: string | null | undefined) => branches.find((b) => b.id === id)?.name;
  const {data:projects=[]}=useQuery({queryKey:['customer_projects'],queryFn:async()=>{const {data,error}=await supabase.from('customer_projects').select('*').order('name');if(error)throw error;return data??[];}});
  const matchingIds = new Set(filterChoices(data.map(c => ({ value: c.id, label: c.name, search: [c.customer_number, ...(c.customer_numbers ?? []), c.street, c.house_number, c.postal_code, c.city, c.email, c.billing_email, c.phone, c.vat_number, c.syndicus, c.syndicus_company, c.syndicus_contact, c.syndicus_email, c.syndicus_billing_email, c.syndicus_phone].filter(Boolean).join(' ') })), q).map(c => c.value));
  const rows = data.filter(c => matchingIds.has(c.id));
  const sort = useSort(rows, { nr: c => c.customer_number, naam: c => c.name, plaats: c => c.city, tel: c => c.phone, mail: c => c.email, btw: c => c.vat_number, syndicus: c => c.syndicus ?? "" });
  const syndici = syndicusSuggestions(data.map((c) => ({ syndicus: c.syndicus_company as string | null })));
  // Eén rij per bekende syndicus: die wordt als sjabloon gebruikt bij bulk toewijzen.
  const templates = useMemo(() => {
    const byName = new Map<string, (typeof data)[number]>();
    for (const c of data) {
      const name = (c.syndicus_company as string | null)?.trim();
      if (name && !byName.has(name)) byName.set(name, c);
    }
    return [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl"));
  }, [data]);
  const allShownSelected = rows.length > 0 && rows.every((r) => sel.has(r.id));

  function toggleSel(id: string, on: boolean) {
    setSel((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function pickTemplate(name: string) {
    setAssignTemplate(name);
    const t = templates.find(([n]) => n === name)?.[1];
    if (t) {
      setAssignCompany((t.syndicus_company as string | null) ?? "");
      setAssignContact((t.syndicus_contact as string | null) ?? "");
    }
  }

  async function assignSyndicus() {
    const ids = [...sel];
    if (!ids.length) return;
    const company = assignCompany.trim();
    if (!company) {
      toast.error("Vul eerst een bedrijfsnaam in.");
      return;
    }
    // Alleen de gegevens van een bekende syndicus meekopiëren als de naam nog overeenkomt.
    const t = assignTemplate && company === assignTemplate.trim() ? templates.find(([n]) => n === assignTemplate)?.[1] : undefined;
    const details: SyndicusDetails = t
      ? Object.fromEntries(SYNDICUS_FIELDS.map((f) => [f.key, (t[f.key] as string | null) ?? ""]))
      : {};
    const patch = syndicusDetailsPatch({ ...details, syndicus_company: company, syndicus_contact: assignContact });
    setAssigning(true);
    const { error } = await supabase.from("customers").update(patch).in("id", ids);
    setAssigning(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${ids.length} klant(en) naar ${patch.syndicus} verplaatst`);
    setSel(new Set());
    setAssignOpen(false);
    setAssignTemplate("");
    setAssignCompany("");
    setAssignContact("");
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  function openEdit(c: (typeof data)[number]) {
    setEditing(editing === c.id ? null : c.id);
    setForm({
      ...Object.fromEntries(FIELDS.map((f) => [f.key, (c[f.key] as string | null) ?? ""])),
      ...Object.fromEntries(SYNDICUS_FIELDS.map((f) => [f.key, (c[f.key] as string | null) ?? ""])),
      // Oudere rijen hebben de syndicus maar als één regel tekst: die in het vak bedrijfsnaam zetten.
      syndicus_company: (c.syndicus_company as string | null) ?? c.syndicus ?? "",
      vrij_beroep: c.vrij_beroep ? "1" : "",
      oud6: Number(c.default_vat_rate) === 6 ? "1" : "",
    });
  }

  async function save(c: (typeof data)[number]) {
    const patch = { ...customerPatch(form as Partial<CustomerRow>), ...syndicusDetailsPatch(form), vrij_beroep: form["vrij_beroep"] === "1", default_vat_rate: form["oud6"] === "1" ? 6 : (Number(c.default_vat_rate) === 6 ? null : c.default_vat_rate) };
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
      <datalist id="syndicus-suggesties">{syndici.map((s) => <option key={s} value={s} />)}</datalist>
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-3xl font-black uppercase">Klanten</h1>
        <label className="ml-auto">
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importExcel(f); }} />
          <Button asChild variant="outline"><span>{busy ? "Inlezen…" : "Excel inlezen"}</span></Button>
        </label>
      </div>
      <Input type="search" aria-label="Klanten zoeken" placeholder="Zoek klantnummer, naam, adres of syndicus…" value={q} onChange={(e) => setQ(e.target.value)} />
      {sel.size > 0 && (
        <div className="rounded-md border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">{sel.size} klant{sel.size > 1 ? "en" : ""} geselecteerd</span>
            <Button size="sm" variant={assignOpen ? "secondary" : "default"} onClick={() => setAssignOpen((o) => !o)}>Syndicus toewijzen</Button>
            <Button size="sm" variant="ghost" onClick={() => { setSel(new Set()); setAssignOpen(false); }}>Selectie wissen</Button>
          </div>
          {assignOpen && (
            <div className="mt-3 space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
              <div className="text-xs text-muted-foreground">Kies een syndicus die je al kent — dan gaan adres, btw-nummer, telefoon en e-mailadressen mee — of typ een nieuwe naam.</div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-52 flex-1 space-y-1">
                  <span className="block text-xs font-bold uppercase text-muted-foreground">Bekende syndicus</span>
                  <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={assignTemplate} onChange={(e) => pickTemplate(e.target.value)}>
                    <option value="">— nieuwe syndicus —</option>
                    {templates.map(([name]) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
                <label className="min-w-48 flex-[2] space-y-1">
                  <span className="block text-xs font-bold uppercase text-muted-foreground">Bedrijfsnaam</span>
                  <Input list="syndicus-suggesties" value={assignCompany} onChange={(e) => setAssignCompany(e.target.value)} placeholder="Bijv. Immo Schrijnemakers BV" />
                </label>
                <label className="min-w-40 flex-1 space-y-1">
                  <span className="block text-xs font-bold uppercase text-muted-foreground">Contactpersoon</span>
                  <Input value={assignContact} onChange={(e) => setAssignContact(e.target.value)} placeholder="Bijv. Olivier Schrijnemakers" />
                </label>
                <Button size="sm" disabled={!assignCompany.trim() || assigning} onClick={assignSyndicus}>{assigning ? "Bezig…" : `Toewijzen aan ${sel.size}`}</Button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className={tableWrap}>
        <table className={tableCls}>
          <thead><tr>
            <Th className="w-px"><input type="checkbox" className="h-4 w-4 accent-primary" aria-label="Alle getoonde klanten selecteren" checked={allShownSelected} onChange={(e) => setSel(e.target.checked ? new Set([...sel, ...rows.map((r) => r.id)]) : new Set())} /></Th>
            <SortTh k="nr" sort={sort} className="w-px">Nr.</SortTh>
            <SortTh k="naam" sort={sort}>Naam</SortTh>
            <SortTh k="plaats" sort={sort} className="hidden md:table-cell">Adres</SortTh>
            <SortTh k="syndicus" sort={sort} className="hidden lg:table-cell">Syndicus</SortTh>
            <SortTh k="tel" sort={sort} className="hidden lg:table-cell">Telefoon</SortTh>
            <SortTh k="mail" sort={sort} className="hidden 2xl:table-cell">E-mail</SortTh>
            <SortTh k="btw" sort={sort} className="hidden 2xl:table-cell">Btw-nummer</SortTh>
            <Th />
          </tr></thead>
          <tbody>
            {sort.sorted.length === 0 && <tr><td colSpan={9} className="text-muted-foreground">Geen klanten.</td></tr>}
            {sort.sorted.map((c) => {
              const own = projects.filter(p => p.customer_id === c.id);
              return (
                <Fragment key={c.id}>
                  <tr>
                    <td className="w-px"><input type="checkbox" className="h-4 w-4 accent-primary" aria-label={`${c.name} selecteren`} checked={sel.has(c.id)} onChange={(e) => toggleSel(c.id, e.target.checked)} /></td>
                    <td className="max-w-24 truncate font-mono text-xs text-muted-foreground" title={c.customer_number ?? ""}>{c.customer_number}</td>
                    <td className="font-bold">{c.name}{branchName((c as { branch_id?: string | null }).branch_id) && <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-xs font-bold uppercase text-primary-foreground" title={(c as { branch_manual?: boolean }).branch_manual ? "Handmatig gekozen vestiging" : "Dichtstbijzijnde vestiging"}>{branchName((c as { branch_id?: string | null }).branch_id)}</span>}{own.length > 0 && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-xs">{own.length} project{own.length > 1 ? "en" : ""}</span>}{Number(c.default_vat_rate) === 6 && !c.vrij_beroep && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-normal">6% btw</span>}{c.vrij_beroep && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-normal">vrij beroep</span>}{c.syndicus && <div className="text-xs font-normal text-muted-foreground lg:hidden">Syndicus: {c.syndicus}</div>}<div className="text-xs font-normal text-muted-foreground md:hidden">{formatAddress(c)}</div></td>
                    <td className="hidden text-muted-foreground md:table-cell">{formatAddress(c) || "—"}</td>
                    <td className="hidden text-muted-foreground lg:table-cell">{c.syndicus_company ?? c.syndicus ?? "—"}</td>
                    <td className="hidden whitespace-nowrap lg:table-cell">{c.phone ?? "—"}</td>
                    <td className="hidden max-w-56 truncate 2xl:table-cell" title={c.email ?? ""}>{c.email ?? "—"}</td>
                    <td className="hidden whitespace-nowrap font-mono text-xs 2xl:table-cell">{c.vat_number ?? "—"}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>{editing === c.id ? "Sluiten" : "Details"}</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                        if (!confirm(`${c.name} verwijderen uit klanten?`)) return;
                        await supabase.from("customers").delete().eq("id", c.id);
                        setSel((prev) => { const next = new Set(prev); next.delete(c.id); return next; });
                        qc.invalidateQueries({ queryKey: ["customers"] });
                      }}>Verwijderen</Button>
                    </td>
                  </tr>
                  {editing === c.id && (
                    <tr className="bg-muted/30"><td colSpan={9}>
                      <div className="space-y-3">
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
                        <div className="rounded-md border border-primary/40 bg-primary/5 p-3">
                          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="text-xs font-black uppercase tracking-wide text-primary">Syndicus</span>
                            <span className="text-xs text-muted-foreground">Bij een VME: het kantoor dat de opdracht gaf. Klant en factuur blijven op naam van de VME, met het eigen btw-nummer van de VME.</span>
                            {(form["syndicus_company"] || form["syndicus_contact"]) && (
                              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setForm((prev) => ({ ...prev, ...Object.fromEntries(SYNDICUS_FIELDS.map((f) => [f.key, ""])) }))}>Syndicus wissen</Button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {SYNDICUS_FIELDS.map((f) => (
                              <label key={f.key} className={`space-y-1 ${f.className}`}>
                                <span className="block text-xs font-bold uppercase text-muted-foreground">{f.label}</span>
                                <Input
                                  list={f.key === "syndicus_company" ? "syndicus-suggesties" : undefined}
                                  value={form[f.key] ?? ""}
                                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                                  placeholder={f.label}
                                />
                              </label>
                            ))}
                          </div>
                          {syndicusLabel(form) && <div className="mt-2 text-xs text-muted-foreground">Weergave in de lijst: <strong className="font-semibold text-foreground">{syndicusLabel(form)}</strong></div>}
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
