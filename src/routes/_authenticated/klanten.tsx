import { SearchableSelect } from "@/components/SearchableSelect";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle, Search } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useState } from "react";
import { SortTh, Th, tableCls, tableWrap, useSort } from "@/components/SortTable";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAddress } from "@/lib/address";
import { allCustomers, customerKey, customerPatch, rowsToCustomers, type CustomerRow } from "@/lib/customers";
import { filterChoices } from "@/lib/choice-search";
import { syndicusDetailsPatch, syndicusLabel, type SyndicusDetailField, type SyndicusDetails } from "@/lib/syndicus";
import { customerDetailsFromDir, dirFromCustomer, syndicusKey, type SyndicusDir } from "@/lib/syndici";
import { syncSyndicusFromCustomer } from "@/lib/syndici.functions";
import { parseContacts, type CustomerContact } from "@/lib/customer-contacts";
import { companyNumber, fillCompanyDetails } from "@/lib/company-lookup";
import { lookupCompany } from "@/lib/company-lookup.functions";
import { PageHeader } from "@/components/PageHeader";
import { VmeSyndicusDialog } from "@/components/VmeSyndicusDialog";
import {
  buildCategoryUpdatePatch,
  buildCustomerExportRows,
  CUSTOMER_CATEGORIES,
  customerCategoryLabel,
  customersToCsv,
  filterCustomersByCategoryAndSyndicus,
  isCustomerCategory,
  resolveCustomerSyndicusName,
  SYNDICUS_FILTER_PENDING,
  UNASSIGNED_CATEGORY_LABEL,
  VME_SYNDICUS_PENDING_LABEL,
  type CustomerCategory,
  type CustomerCategoryFilter,
} from "@/lib/customer-categories";
import { useRole } from "@/lib/use-role";

export const Route = createFileRoute("/_authenticated/klanten")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => (typeof search["q"] === "string" && search["q"] ? { q: search["q"] } : {}),
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
  { key: "vat_number", label: "Ondernemings-/btw-nummer", className: "w-60" },
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

function ContactsEditor({ form, setForm }: { form: Record<string, string>; setForm: React.Dispatch<React.SetStateAction<Record<string, string>>> }) {
  const list: CustomerContact[] = (() => { try { return JSON.parse(form["contacts"] || "[]"); } catch { return []; } })();
  const set = (next: CustomerContact[]) => setForm((prev) => ({ ...prev, contacts: JSON.stringify(next) }));
  const patch = (i: number, p: Partial<CustomerContact>) => set(list.map((c, j) => (j === i ? { ...c, ...p } : c)));
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs font-black uppercase tracking-wide text-primary">Contactpersonen</span>
        <span className="text-xs text-muted-foreground">Bv. conciërge of bewoners van het gebouw — kies je later bij een taak, zodat de ploeg de juiste persoon belt.</span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => set([...list, { name: "", phone: "", role: "" }])}>Contactpersoon toevoegen</Button>
      </div>
      {list.length === 0 && <div className="text-xs text-muted-foreground">Nog geen contactpersonen.</div>}
      <div className="space-y-2">
        {list.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input className="min-w-40 flex-1" placeholder="Naam" aria-label="Naam contactpersoon" value={c.name} onChange={(e) => patch(i, { name: e.target.value })} />
            <Input className="w-44" placeholder="Telefoon" aria-label="Telefoon contactpersoon" value={c.phone} onChange={(e) => patch(i, { phone: e.target.value })} />
            <Input className="w-44" placeholder="Rol (bv. conciërge, app. 2B)" aria-label="Rol contactpersoon" value={c.role ?? ""} onChange={(e) => patch(i, { role: e.target.value })} />
            <Button size="sm" variant="ghost" onClick={() => set(list.filter((_, j) => j !== i))}>Verwijderen</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** De volledige klantfiche: eigen gegevens, syndicusblok en btw-keuzes. Gedeeld tussen bewerken en nieuw aanmaken. */
function CustomerFormFields({
  form,
  setForm,
  templates = [],
  directory = [],
}: {
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  templates?: { name: string; details: SyndicusDetails }[];
  directory?: SyndicusDir[];
}) {
  const lookup = useServerFn(lookupCompany);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupMessage, setLookupMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const number = form["vat_number"] ?? "";
  useEffect(() => {
    let active = true;
    setLookupMessage("");
    setLookingUp(false);
    if (!companyNumber(number)) return;
    const timer = setTimeout(async () => {
      setLookingUp(true);
      try {
        const result = await lookup({ data: { number } });
        if (!active) return;
        if (result.ok) {
          setForm(prev => prev["vat_number"] === number ? fillCompanyDetails(prev, result.details) : prev);
          setLookupMessage(`Gevonden: ${result.details.name || "bedrijfsadres"}`);
        } else setLookupMessage(result.message);
      } catch {
        if (active) setLookupMessage("Opzoeken mislukt. Probeer opnieuw.");
      } finally {
        if (active) setLookingUp(false);
      }
    }, 700);
    return () => { active = false; clearTimeout(timer); };
  }, [number, retry, lookup, setForm]);
  // Kiest de gebruiker een bekende syndicus, dan gaan alle gegevens van die
  // syndicus mee (adres, btw-nummer, telefoon, e-mails). De eigen gegevens van
  // de VME blijven onaangeroerd.
  function changeSyndicusCompany(value: string) {
    setForm((prev) => {
      const next: Record<string, string> = { ...prev, syndicus_company: value };
      const t = templates.find((x) => x.name.trim().toLowerCase() === value.trim().toLowerCase());
      if (t) {
        for (const f of SYNDICUS_FIELDS) next[f.key] = (t.details[f.key as SyndicusDetailField] as string | null) ?? "";
        // Heeft de VME zelf nog geen e-mailadres, dan gelden de mailadressen van
        // de syndicus als contactadres — daar loopt de opdracht immers binnen.
        if (!next["email"]?.trim()) next["email"] = (t.details.syndicus_email as string | null) ?? "";
        if (!next["billing_email"]?.trim()) next["billing_email"] = (t.details.syndicus_billing_email as string | null) ?? (t.details.syndicus_email as string | null) ?? "";
      }
      return next;
    });
  }
  return (
    <>
      <div className="flex flex-wrap items-end gap-3 rounded-md border border-border/80 bg-muted/20 p-3">
        <label className="min-w-48 flex-1 space-y-1">
          <span className="block text-xs font-bold uppercase text-muted-foreground">Klantcategorie</span>
          <select
            aria-label="Klantcategorie"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground"
            value={form["customer_category"] ?? ""}
            onChange={(e) => {
              const next = e.target.value;
              setForm((prev) => ({
                ...prev,
                customer_category: next,
                vme_syndicus_pending: next === "vme" ? prev["vme_syndicus_pending"] ?? "" : "",
              }));
            }}
          >
            <option value="">{UNASSIGNED_CATEGORY_LABEL}</option>
            {CUSTOMER_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </label>
        {form["customer_category"] === "vme" && (
          <>
            <label className="min-w-56 flex-[2] space-y-1">
              <span className="block text-xs font-bold uppercase text-primary">Verantwoordelijke syndicus (VME) *</span>
              <SearchableSelect
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={form["syndicus_id"] ?? ""}
                onChange={(e) => {
                  const id = e.target.value;
                  const found = directory.find((d) => d.id === id);
                  setForm((prev) => {
                    const next: Record<string, string> = {
                      ...prev,
                      syndicus_id: id,
                      vme_syndicus_pending: id ? "" : prev["vme_syndicus_pending"] ?? "",
                    };
                    if (found) {
                      const details = customerDetailsFromDir(found);
                      for (const f of SYNDICUS_FIELDS) next[f.key] = (details[f.key as SyndicusDetailField] as string | null) ?? "";
                    }
                    return next;
                  });
                }}
              >
                <option value="">— kies bestaande syndicus —</option>
                {directory.map((d) => (
                  <option key={d.id} value={d.id}>{d.company}{d.city ? ` (${d.city})` : ""}</option>
                ))}
              </SearchableSelect>
            </label>
            <label className="flex h-9 items-center gap-2 text-xs font-medium text-muted-foreground">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={form["vme_syndicus_pending"] === "1" && !form["syndicus_id"]}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    syndicus_id: e.target.checked ? "" : prev["syndicus_id"] ?? "",
                    vme_syndicus_pending: e.target.checked ? "1" : "",
                  }))
                }
              />
              {VME_SYNDICUS_PENDING_LABEL}
            </label>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {FIELDS.map((f) => (
          <label key={f.key} className={`space-y-1 ${f.className}`}>
            <span className="block text-xs font-bold uppercase text-muted-foreground">{f.label}</span>
            <div className="flex items-center gap-1">
              <Input value={form[f.key] ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.label} />
              {f.key === "vat_number" && <Button type="button" size="icon" variant="outline" className="shrink-0" disabled={lookingUp || !companyNumber(number)} aria-label="Bedrijfsgegevens opzoeken" title="Bedrijfsgegevens opzoeken" onClick={() => setRetry(value => value + 1)}>{lookingUp ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" /> : <Search className="size-4" />}</Button>}
            </div>
          </label>
        ))}
      </div>
      {(lookingUp || lookupMessage) && <p role="status" className="text-sm text-muted-foreground">{lookingUp ? "Bedrijfsgegevens opzoeken…" : lookupMessage}</p>}
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
                onChange={(e) => (f.key === "syndicus_company" ? changeSyndicusCompany(e.target.value) : setForm((prev) => ({ ...prev, [f.key]: e.target.value })))}
                placeholder={f.label}
              />
            </label>
          ))}
        </div>
        {syndicusLabel(form) && <div className="mt-2 text-xs text-muted-foreground">Weergave in de lijst: <strong className="font-semibold text-foreground">{syndicusLabel(form)}</strong></div>}
      </div>
      <ContactsEditor form={form} setForm={setForm} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-primary" checked={form["vrij_beroep"] === "1"} onChange={(e) => setForm((prev) => ({ ...prev, vrij_beroep: e.target.checked ? "1" : "" }))} />
        Vrij beroep — altijd 21% btw, ook met een btw-nummer
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-primary" checked={form["oud6"] === "1"} onChange={(e) => setForm((prev) => ({ ...prev, oud6: e.target.checked ? "1" : "" }))} />
        Particulier, woning ouder dan 10 jaar — 6% btw
      </label>
    </>
  );
}

function Klanten() {
  const qc = useQueryClient();
  const role = useRole();
  const canEditCategory = role === "admin" || role === "marketing";
  const canExportContact = role === "admin" || role === "marketing";
  const search = Route.useSearch();
  const [q, setQ] = useState(search.q ?? "");
  useEffect(() => setQ(search.q ?? ""), [search.q]);
  const [categoryFilter, setCategoryFilter] = useState<CustomerCategoryFilter>("all");
  const [syndicusFilter, setSyndicusFilter] = useState<string>("");
  const [bulkCategory, setBulkCategory] = useState<string>("");
  const [vmeDialog, setVmeDialog] = useState<{
    ids: string[];
    title: string;
    initialSyndicusId?: string | null;
  } | null>(null);
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
  const [creating, setCreating] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: () => allCustomers(supabase),
  });
  const { data: branches = [] } = useQuery({ queryKey: ["branches"], queryFn: async () => (await supabase.from("branches").select("*").order("name")).data ?? [] });
  const { data: directory = [] } = useQuery({
    queryKey: ["syndici"],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from("syndici").select("*").order("company");
      if (error) throw new Error(error.message);
      return (rows ?? []) as SyndicusDir[];
    },
  });
  const branchName = (id: string | null | undefined) => branches.find((b) => b.id === id)?.name;
  const {data:projects=[]}=useQuery({queryKey:['customer_projects'],queryFn:async()=>{const {data,error}=await supabase.from('customer_projects').select('*').order('name');if(error)throw error;return data??[];}});
  const matchingIds = new Set(filterChoices(data.map(c => ({ value: c.id, label: c.name, search: [c.customer_number, ...(c.customer_numbers ?? []), c.street, c.house_number, c.postal_code, c.city, c.email, c.billing_email, c.phone, c.vat_number, c.syndicus, c.syndicus_company, c.syndicus_contact, c.syndicus_email, c.syndicus_billing_email, c.syndicus_phone].filter(Boolean).join(' ') })), q).map(c => c.value));
  const searchedRows = useMemo(() => data.filter((c) => matchingIds.has(c.id)), [data, q]);
  const rows = useMemo(
    () => filterCustomersByCategoryAndSyndicus(searchedRows, { categoryFilter, syndicusFilter }),
    [searchedRows, categoryFilter, syndicusFilter],
  );
  const categoryCounts = useMemo(() => {
    const counts: Record<CustomerCategoryFilter, number> = {
      all: searchedRows.length,
      zakelijk: 0,
      vme: 0,
      particulier: 0,
      patrimoniumvennootschap: 0,
      unassigned: 0,
    };
    for (const c of searchedRows) {
      const cat = (c as { customer_category?: string | null }).customer_category;
      if (isCustomerCategory(cat)) counts[cat] += 1;
      else counts.unassigned += 1;
    }
    return counts;
  }, [searchedRows]);
  const sort = useSort(rows, {
    nr: c => c.customer_number,
    naam: c => c.name,
    categorie: c => customerCategoryLabel((c as { customer_category?: string | null }).customer_category),
    plaats: c => c.city,
    tel: c => c.phone,
    mail: c => c.email,
    btw: c => c.vat_number,
    syndicus: c => resolveCustomerSyndicusName(c as { customer_category?: string | null; syndicus_id?: string | null; vme_syndicus_pending?: boolean | null; syndicus_company?: string | null; syndicus?: string | null }, directory),
  });
  // Eén keuze per bekende syndicus: eerst de contactfiche (die is volledig), dan
  // de namen die voorlopig alleen bij klanten voorkomen.
  const templates = useMemo(() => {
    const byKey = new Map<string, { name: string; details: SyndicusDetails }>();
    for (const d of directory) {
      const name = (d.company ?? "").trim();
      const key = syndicusKey(name);
      if (!key || byKey.has(key)) continue;
      byKey.set(key, { name, details: customerDetailsFromDir(d) });
    }
    for (const c of data) {
      const name = ((c.syndicus_company as string | null) ?? "").trim();
      const key = syndicusKey(name);
      if (!key || byKey.has(key)) continue;
      byKey.set(
        key,
        { name, details: Object.fromEntries(SYNDICUS_FIELDS.map((f) => [f.key, (c[f.key] as string | null) ?? ""])) as SyndicusDetails },
      );
    }
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name, "nl"));
  }, [data, directory]);
  const syndici = templates.map((t) => t.name);
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
    const t = templates.find((x) => x.name === name);
    if (t) {
      setAssignCompany((t.details.syndicus_company as string | null) ?? "");
      setAssignContact((t.details.syndicus_contact as string | null) ?? "");
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
    const t = assignTemplate && company === assignTemplate.trim() ? templates.find((x) => x.name === assignTemplate) : undefined;
    const patch = syndicusDetailsPatch({ ...(t?.details ?? {}), syndicus_company: company, syndicus_contact: assignContact });
    setAssigning(true);
    const { error } = await supabase.from("customers").update(patch).in("id", ids);
    if (!error) await ficheBijwerken(patch);
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
    qc.invalidateQueries({ queryKey: ["syndici"] });
  }

  // De contactfiche van de syndicus op de hoogte houden. Lukt dat niet, dan staat
  // de klant zelf goed en is de fiche later bij te werken op de pagina Syndici.
  async function ficheBijwerken(patch: Record<string, unknown>) {
    try {
      await syncSyndicusFromCustomer({ data: dirFromCustomer(patch) });
    } catch {
      /* de klantgegevens zijn bewaard; de fiche volgt bij de volgende bewerking */
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ vrij_beroep: "", oud6: "", customer_category: "", syndicus_id: "", vme_syndicus_pending: "" });
    setCreating(true);
  }

  async function createCustomer() {
    const nextCat = isCustomerCategory(form["customer_category"]) ? form["customer_category"] : null;
    const selectedSyn = directory.find((d) => d.id === form["syndicus_id"]) ?? null;
    if (nextCat === "vme" && !selectedSyn && form["vme_syndicus_pending"] !== "1" && !form["syndicus_company"]?.trim()) {
      toast.error("Kies een verantwoordelijke syndicus voor deze VME of vink 'Nog toe te wijzen' aan.");
      return;
    }
    const patch = {
      ...customerPatch(form as Partial<CustomerRow>),
      ...syndicusDetailsPatch(form),
      customer_category: nextCat,
      syndicus_id: nextCat === "vme" ? (selectedSyn?.id ?? null) : null,
      vme_syndicus_pending: nextCat === "vme" && !selectedSyn && form["vme_syndicus_pending"] === "1",
      contacts: parseContacts(JSON.parse(form["contacts"] || "[]")),
      vrij_beroep: form["vrij_beroep"] === "1",
      default_vat_rate: form["oud6"] === "1" ? 6 : null,
    };
    if (!patch.name) {
      toast.error("De naam mag niet leeg zijn.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("customers").insert({ ...patch, name: patch.name });
    setSaving(false);
    if (error) {
      toast.error(error.code === "23505" ? "Er bestaat al een klant met deze naam en adres." : error.message);
      return;
    }
    toast.success(`${patch.name} aangemaakt`);
    await ficheBijwerken(patch as Record<string, unknown>);
    setCreating(false);
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["syndici"] });
  }

  function openEdit(c: (typeof data)[number]) {
    setCreating(false);
    setEditing(editing === c.id ? null : c.id);
    const ext = c as { customer_category?: string | null; syndicus_id?: string | null; vme_syndicus_pending?: boolean | null };
    setForm({
      ...Object.fromEntries(FIELDS.map((f) => [f.key, (c[f.key] as string | null) ?? ""])),
      ...Object.fromEntries(SYNDICUS_FIELDS.map((f) => [f.key, (c[f.key] as string | null) ?? ""])),
      // Oudere rijen hebben de syndicus maar als één regel tekst: die in het vak bedrijfsnaam zetten.
      syndicus_company: (c.syndicus_company as string | null) ?? c.syndicus ?? "",
      customer_category: ext.customer_category ?? "",
      syndicus_id: ext.syndicus_id ?? "",
      vme_syndicus_pending: ext.vme_syndicus_pending ? "1" : "",
      vrij_beroep: c.vrij_beroep ? "1" : "",
      oud6: Number(c.default_vat_rate) === 6 ? "1" : "",
      contacts: JSON.stringify(parseContacts((c as { contacts?: unknown }).contacts)),
    });
  }

  async function save(c: (typeof data)[number]) {
    const prevCat = (c as { customer_category?: string | null }).customer_category ?? null;
    const nextCat = isCustomerCategory(form["customer_category"]) ? form["customer_category"] : null;
    const selectedSyn = directory.find((d) => d.id === form["syndicus_id"]) ?? null;
    if (nextCat === "vme" && !selectedSyn && form["vme_syndicus_pending"] !== "1" && !form["syndicus_company"]?.trim()) {
      toast.error("Kies een verantwoordelijke syndicus voor deze VME of vink 'Nog toe te wijzen' aan.");
      return;
    }
    let clearSyn = false;
    if (prevCat === "vme" && nextCat !== "vme" && (form["syndicus_id"] || form["syndicus_company"]?.trim())) {
      clearSyn = confirm("Deze klant is geen VME meer. Wil je de gekoppelde syndicusrelatie ook verwijderen? (OK = verwijderen, Annuleren = behouden)");
    }
    const patch = {
      ...customerPatch(form as Partial<CustomerRow>),
      ...(clearSyn ? syndicusDetailsPatch({}) : syndicusDetailsPatch(form)),
      customer_category: nextCat,
      syndicus_id: clearSyn ? null : (nextCat === "vme" ? (selectedSyn?.id ?? null) : (form["syndicus_id"] || null)),
      vme_syndicus_pending: nextCat === "vme" && !selectedSyn && form["vme_syndicus_pending"] === "1",
      contacts: parseContacts(JSON.parse(form["contacts"] || "[]")),
      vrij_beroep: form["vrij_beroep"] === "1",
      default_vat_rate: form["oud6"] === "1" ? 6 : (Number(c.default_vat_rate) === 6 ? null : c.default_vat_rate),
    };
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
    await ficheBijwerken(patch as Record<string, unknown>);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["syndici"] });
  }

  async function applyCategoryPatch(ids: string[], patch: Record<string, unknown>, successMsg: string) {
    const { error } = await supabase
      .from("customers")
      .update(patch as Database["public"]["Tables"]["customers"]["Update"])
      .in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(successMsg);
    qc.invalidateQueries({ queryKey: ["customers"] });
    qc.invalidateQueries({ queryKey: ["syndici"] });
  }

  async function handleInlineCategoryChange(c: (typeof data)[number], rawNext: string) {
    const nextCat: CustomerCategory | null = isCustomerCategory(rawNext) ? rawNext : null;
    const ext = c as { customer_category?: string | null; syndicus_id?: string | null };
    if (nextCat === "vme") {
      setVmeDialog({ ids: [c.id], title: `Klant: ${c.name}`, initialSyndicusId: ext.syndicus_id ?? null });
      return;
    }
    let clearSyndicusOnLeave = false;
    if (ext.customer_category === "vme" && (ext.syndicus_id || c.syndicus_company || c.syndicus)) {
      clearSyndicusOnLeave = confirm(
        `${c.name} is niet langer een VME. Wil je de gekoppelde syndicusrelatie ook verwijderen? (OK = verwijderen, Annuleren = behouden)`,
      );
    }
    const res = buildCategoryUpdatePatch({
      nextCategory: nextCat,
      previousCategory: ext.customer_category ?? null,
      clearSyndicusOnLeave,
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    await applyCategoryPatch([c.id], res.patch, `${c.name}: categorie op ${customerCategoryLabel(nextCat)} gezet`);
  }

  async function handleBulkCategoryApply() {
    const ids = [...sel];
    if (!ids.length) return;
    const nextCat: CustomerCategory | null = isCustomerCategory(bulkCategory) ? bulkCategory : null;
    if (nextCat === "vme") {
      setVmeDialog({ ids, title: `${ids.length} geselecteerde klant(en) als VME instellen` });
      return;
    }
    if (!confirm(`Categorie '${customerCategoryLabel(nextCat)}' toewijzen aan ${ids.length} geselecteerde klant(en)?`)) return;
    const res = buildCategoryUpdatePatch({ nextCategory: nextCat });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    await applyCategoryPatch(ids, res.patch, `${ids.length} klant(en) ingesteld als ${customerCategoryLabel(nextCat)}`);
    setSel(new Set());
    setBulkCategory("");
  }

  async function createSyndicusAndLink(ids: string[], company: string, contact: string) {
    await syncSyndicusFromCustomer({ data: { company, contact: contact || null } });
    const { data: rowsSyn, error } = await supabase.from("syndici").select("*").ilike("company", company).limit(1);
    if (error || !rowsSyn?.[0]) {
      toast.error(error?.message || "Nieuwe syndicus kon niet worden opgehaald.");
      return;
    }
    const syn = rowsSyn[0] as SyndicusDir;
    const res = buildCategoryUpdatePatch({ nextCategory: "vme", syndicus: syn });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    await applyCategoryPatch(ids, res.patch, `VME gekoppeld aan ${syn.company}`);
    setSel(new Set());
  }

  function exportFilteredCsv() {
    const exportRows = buildCustomerExportRows(sort.sorted as never[], directory, { includeContactAndAddress: canExportContact });
    const csv = customersToCsv(exportRows, canExportContact);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `klanten-${categoryFilter}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  async function exportFilteredXlsx() {
    const XLSX = await import("xlsx");
    const exportRows = buildCustomerExportRows(sort.sorted as never[], directory, { includeContactAndAddress: canExportContact });
    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Klanten");
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `klanten-${categoryFilter}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
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
    <div className="space-y-5">
      <datalist id="syndicus-suggesties">{syndici.map((s) => <option key={s} value={s} />)}</datalist>
      <PageHeader
        title="Klanten"
        subtitle="Beheer klantfiches, adressen, syndici, contactpersonen en btw-regels."
        actions={
          <>
            <Button variant={creating ? "secondary" : "default"} onClick={() => (creating ? setCreating(false) : openCreate())}>
              {creating ? "Sluiten" : "Nieuwe klant"}
            </Button>
            <label>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importExcel(f); }} />
              <Button asChild variant="outline"><span>{busy ? "Inlezen…" : "Excel inlezen"}</span></Button>
            </label>
            <Button variant="outline" disabled={sort.sorted.length === 0} onClick={exportFilteredCsv}>CSV export</Button>
            <Button variant="outline" disabled={sort.sorted.length === 0} onClick={exportFilteredXlsx}>Excel export</Button>
          </>
        }
      />
      <div className="space-y-3 rounded-xl border border-border/90 bg-card p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Input type="search" aria-label="Klanten zoeken" placeholder="Zoek klantnummer, naam, adres of syndicus…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-lg flex-1" />
          {categoryFilter === "vme" && (
            <div className="min-w-52">
              <SearchableSelect
                aria-label="Filter op syndicus"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={syndicusFilter}
                onChange={(e) => setSyndicusFilter(e.target.value)}
              >
                <option value="">Alle syndici</option>
                <option value={SYNDICUS_FILTER_PENDING}>{VME_SYNDICUS_PENDING_LABEL}</option>
                {directory.map((d) => (
                  <option key={d.id} value={d.id}>{d.company}</option>
                ))}
              </SearchableSelect>
            </div>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{rows.length} klant{rows.length === 1 ? "" : "en"}</span>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter op klantcategorie">
          {(
            [
              { key: "all", label: "Alle" },
              ...CUSTOMER_CATEGORIES.map((c) => ({ key: c.value as CustomerCategoryFilter, label: c.label })),
              { key: "unassigned", label: UNASSIGNED_CATEGORY_LABEL },
            ] as { key: CustomerCategoryFilter; label: string }[]
          ).map((tab) => {
            const active = categoryFilter === tab.key;
            return (
              <Button
                key={tab.key}
                type="button"
                size="sm"
                variant={active ? "default" : "outline"}
                className="h-7 px-2.5 text-xs"
                onClick={() => {
                  setCategoryFilter(tab.key);
                  if (tab.key !== "vme") setSyndicusFilter("");
                }}
              >
                {tab.label} ({categoryCounts[tab.key]})
              </Button>
            );
          })}
        </div>
      </div>
      {creating && (
        <div className="space-y-3 rounded-xl border border-primary/40 bg-card p-4 shadow-xs sm:p-5">
          <div className="border-b border-border/70 pb-2 text-sm font-bold text-foreground">Nieuwe klant aanmaken</div>
          <CustomerFormFields form={form} setForm={setForm} templates={templates} directory={directory} />
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={createCustomer}>{saving ? "Bezig…" : "Klant aanmaken"}</Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setCreating(false)}>Annuleren</Button>
          </div>
        </div>
      )}
      {sel.size > 0 && (
        <div className="rounded-md border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold">{sel.size} klant{sel.size > 1 ? "en" : ""} geselecteerd</span>
            {canEditCategory && (
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Bulk klantcategorie"
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  value={bulkCategory}
                  onChange={(e) => setBulkCategory(e.target.value)}
                >
                  <option value="">{UNASSIGNED_CATEGORY_LABEL}</option>
                  {CUSTOMER_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <Button size="sm" variant="outline" onClick={handleBulkCategoryApply}>Categorie toewijzen</Button>
              </div>
            )}
            <Button size="sm" variant={assignOpen ? "secondary" : "default"} onClick={() => setAssignOpen((o) => !o)}>Syndicus toewijzen</Button>
            <Button size="sm" variant="ghost" onClick={() => { setSel(new Set()); setAssignOpen(false); }}>Selectie wissen</Button>
          </div>
          {assignOpen && (
            <div className="mt-3 space-y-2 rounded-md border border-primary/40 bg-primary/5 p-3">
              <div className="text-xs text-muted-foreground">Kies een syndicus van de contactfiches — dan gaan adres, btw-nummer, telefoon en e-mailadressen mee — of typ een nieuwe naam.</div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-52 flex-1 space-y-1">
                  <span className="block text-xs font-bold uppercase text-muted-foreground">Bekende syndicus</span>
                  <SearchableSelect className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={assignTemplate} onChange={(e) => pickTemplate(e.target.value)}>
                    <option value="">— nieuwe syndicus —</option>
                    {templates.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                  </SearchableSelect>
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
            <SortTh k="categorie" sort={sort}>Categorie</SortTh>
            <SortTh k="plaats" sort={sort} className="hidden md:table-cell">Adres</SortTh>
            <SortTh k="syndicus" sort={sort} className="hidden lg:table-cell">Syndicus</SortTh>
            <SortTh k="tel" sort={sort} className="hidden lg:table-cell">Telefoon</SortTh>
            <SortTh k="mail" sort={sort} className="hidden 2xl:table-cell">E-mail</SortTh>
            <SortTh k="btw" sort={sort} className="hidden 2xl:table-cell">Btw-nummer</SortTh>
            <Th />
          </tr></thead>
          <tbody>
            {sort.sorted.length === 0 && <tr><td colSpan={10} className="text-muted-foreground">Geen klanten.</td></tr>}
            {sort.sorted.map((c) => {
              const own = projects.filter(p => p.customer_id === c.id);
              const ext = c as { customer_category?: string | null; syndicus_id?: string | null; vme_syndicus_pending?: boolean | null };
              const synDisplay = resolveCustomerSyndicusName({ ...ext, syndicus_company: c.syndicus_company, syndicus: c.syndicus }, directory);
              return (
                <Fragment key={c.id}>
                  <tr>
                    <td className="w-px"><input type="checkbox" className="h-4 w-4 accent-primary" aria-label={`${c.name} selecteren`} checked={sel.has(c.id)} onChange={(e) => toggleSel(c.id, e.target.checked)} /></td>
                    <td className="max-w-24 truncate font-mono text-xs text-muted-foreground" title={c.customer_number ?? ""}>{c.customer_number}</td>
                    <td className="font-bold">{c.name}{branchName((c as { branch_id?: string | null }).branch_id) && <span className="ml-2 rounded bg-primary px-1.5 py-0.5 text-xs font-bold uppercase text-primary-foreground" title={(c as { branch_manual?: boolean }).branch_manual ? "Handmatig gekozen vestiging" : "Dichtstbijzijnde vestiging"}>{branchName((c as { branch_id?: string | null }).branch_id)}</span>}{own.length > 0 && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-xs">{own.length} project{own.length > 1 ? "en" : ""}</span>}{Number(c.default_vat_rate) === 6 && !c.vrij_beroep && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-normal">6% btw</span>}{c.vrij_beroep && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-normal">vrij beroep</span>}{synDisplay && <div className="text-xs font-normal text-muted-foreground lg:hidden">Syndicus: {synDisplay}</div>}<div className="text-xs font-normal text-muted-foreground md:hidden">{formatAddress(c)}</div></td>
                    <td className="whitespace-nowrap">
                      {canEditCategory ? (
                        <select
                          aria-label={`Categorie voor ${c.name}`}
                          className="h-8 max-w-44 rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground"
                          value={ext.customer_category ?? ""}
                          onChange={(e) => handleInlineCategoryChange(c, e.target.value)}
                        >
                          <option value="">{UNASSIGNED_CATEGORY_LABEL}</option>
                          {CUSTOMER_CATEGORIES.map((cat) => (
                            <option key={cat.value} value={cat.value}>{cat.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground">{customerCategoryLabel(ext.customer_category)}</span>
                      )}
                    </td>
                    <td className="hidden text-muted-foreground md:table-cell">{formatAddress(c) || "—"}</td>
                    <td className="hidden text-muted-foreground lg:table-cell">{synDisplay || "—"}</td>
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
                    <tr className="bg-muted/30"><td colSpan={10}>
                      <div className="space-y-3">
                        {c.customer_numbers?.length > 1 && <div className="text-xs text-muted-foreground">Klantnummers: {c.customer_numbers.join(', ')}</div>}
                        {own.map(p => <div key={p.id} className="border-l-2 border-primary pl-3 text-sm"><span className="font-mono text-muted-foreground">{p.number} </span><strong>{p.name}</strong><div className="text-muted-foreground">{formatAddress(p)}</div></div>)}
                        <CustomerFormFields form={form} setForm={setForm} templates={templates} directory={directory} />
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
      {vmeDialog && (
        <VmeSyndicusDialog
          open={true}
          title={vmeDialog.title}
          directory={directory}
          initialSyndicusId={vmeDialog.initialSyndicusId ?? null}
          onClose={() => setVmeDialog(null)}
          onConfirmExisting={async (syn) => {
            const res = buildCategoryUpdatePatch({ nextCategory: "vme", syndicus: syn });
            if (!res.ok) { toast.error(res.error); return; }
            await applyCategoryPatch(vmeDialog.ids, res.patch, `VME gekoppeld aan ${syn.company}`);
            setSel(new Set());
          }}
          onCreateAndConfirm={async (company, contact) => {
            await createSyndicusAndLink(vmeDialog.ids, company, contact);
          }}
          onConfirmPending={async () => {
            const res = buildCategoryUpdatePatch({ nextCategory: "vme", vmePending: true });
            if (!res.ok) { toast.error(res.error); return; }
            await applyCategoryPatch(vmeDialog.ids, res.patch, "VME opgeslagen (syndicus nog toe te wijzen)");
            setSel(new Set());
          }}
        />
      )}
    </div>
  );
}
