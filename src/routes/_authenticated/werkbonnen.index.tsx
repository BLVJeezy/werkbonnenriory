import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { importFromMailbox, MAILBOX_ADDRESS } from "@/lib/mailbox.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SiteAddressFields } from "@/components/SiteAddressFields";
import { destinationAddress, destinationLabel, destinationLines, formatAddress, type SiteAddressParts } from "@/lib/address";
import { usePerms, useRole } from "@/lib/use-role";
import { TaskActions } from "@/components/TaskActions";
import { MailboxConnect, WerkbonMailboxConnect } from "@/components/MailboxConnect";
import { deleteTask } from "@/lib/delete-task";
import { CustomerInvite } from "@/components/CustomerInvite";
import { crewStyle } from "@/lib/crew-color";
import { VAT_RATES } from "@/lib/billing";
import { crewBuckets } from "@/lib/schedule";
import { vatRateForCustomer } from "@/lib/vat-number";
import { RunningTask } from "@/components/RunningTask";
import { activeTimeEntry } from "@/lib/time";
import { allCustomers, customerKey } from '@/lib/customers';
import { quoteFromTask } from '@/lib/quotes.functions';
import { FilePenLine } from 'lucide-react';
import { taskListRows, newTaskRows, plannedTaskRows } from '@/lib/task-list';
import { isUrgentOpen, URGENT_RING } from '@/lib/urgent';
import type { Database } from '@/integrations/supabase/types';
import { AppointmentMailSync } from '@/components/AppointmentMailSync';

export const Route = createFileRoute("/_authenticated/werkbonnen/")({
  head: () => ({ meta: [{ title: "Taken — Riory" }, { name: "description", content: "Taken en afgetekende werkbonnen met klant- en werfgegevens." }, { property: "og:title", content: "Taken — Riory" }, { property: "og:description", content: "Taken en afgetekende werkbonnen met klant- en werfgegevens." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (s: Record<string, unknown>): { dag?: string } =>
    typeof s["dag"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["dag"]) ? { dag: s["dag"] } : {},
  component: Lijst,
});

const FILTERS = ["nieuw", "ingepland", "bezig", "afgetekend", "alle"] as const;
const FILTER_LABELS = { nieuw: "Nieuwe taken", ingepland: "Ingepland", bezig: "Bezig", afgetekend: "Afgewerkt", alle: "Alle" };
const emptyForm = { name: "", street: "", house_number: "", postal_code: "", city: "", phone: "", email: "", billing_email: "", vat_number: "", project_name: "", description: "", technician_id: "", activity_id: "", vat_rate: "21", scheduled_date: "", use_site_address: false, site_street: "", site_house_number: "", site_postal_code: "", site_city: "", site_contact_name: "", site_contact_phone: "" };

function Lijst() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const runImport = useServerFn(importFromMailbox);
  const makeQuote = useServerFn(quoteFromTask);
  const [quotingId, setQuotingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("nieuw");
  const { dag } = Route.useSearch();
  const [open, setOpenState] = useState(!!dag);
  const [form, setForm] = useState({ ...emptyForm, scheduled_date: dag ?? "" });
  const setOpen = (v: boolean) => {
    setOpenState(v);
    if (!v && dag) navigate({ to: "/werkbonnen", search: {}, replace: true });
  };
  const [saving, setSaving] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["work_orders"],
    refetchInterval: 10000,
    queryFn: async () =>
      taskListRows((await supabase.from("work_orders").select("*, technicians(name, color), time_entries(id, started_at, ended_at)").neq("status", "offerte").eq("quote_pending", false).order("created_at", { ascending: false })).data ?? []),
  });
  const role = useRole();
  const { data: opts } = useQuery({
    queryKey: ["assign_opts"],
    enabled: role === "admin",
    queryFn: async () => {
      const [t, a] = await Promise.all([
        supabase.from("technicians").select("id, name").order("name"),
        supabase.from("activities").select("id, name, hourly_rate").order("name"),
      ]);
      return { techs: t.data ?? [], acts: a.data ?? [] };
    },
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    enabled: role === "admin",
    queryFn: () => allCustomers(supabase),
  });
  const {data:projects=[]}=useQuery({queryKey:['customer_projects'],enabled:role==='admin',queryFn:async()=>{const {data,error}=await supabase.from('customer_projects').select('*').order('name');if(error)throw error;return data??[];}});
  const selectedCustomer = customers.find(c=>customerKey(c)===customerKey(form));
  const selectedProjects = projects.filter(p=>p.customer_id===selectedCustomer?.id);
  const customerLabel = (c: (typeof customers)[number]) => [c.customer_number,c.name, [c.street, c.house_number].filter(Boolean).join(" "), c.city].filter(Boolean).join(" — ");
  function pickCustomer(label: string) {
    const c = customers.find((x) => customerLabel(x) === label);
    if (!c) return;
    setForm((f) => ({ ...f, name: c.name, street: c.street ?? "", house_number: c.house_number ?? "", postal_code: c.postal_code ?? "", city: c.city ?? "", phone: c.phone ?? "", email: c.email ?? "", billing_email: c.billing_email ?? "", vat_number: c.vat_number ?? "", project_name: c.project_name ?? "", vat_rate: String(vatRateForCustomer(c.vat_number ?? "", Number(f.vat_rate))) }));
  }
  const filtered = filter === "alle" ? data : filter === "nieuw" ? newTaskRows(data) : filter === "ingepland" ? plannedTaskRows(data) : filter === "bezig" ? data.filter((w) => activeTimeEntry(w.time_entries)) : data.filter((w) => w.status === filter);
  const rows = [...filtered].sort((a, b) => Number(isUrgentOpen(b)) - Number(isUrgentOpen(a)));
  async function patch(id: string, p: Database["public"]["Tables"]["work_orders"]["Update"]) {
    const { error } = await supabase.from("work_orders").update(p).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["work_orders"] });
  }
  if (role === "technician") return <TechList rows={data} />;

  async function addToe(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data: created, error } = await supabase
      .from("work_orders")
      .insert({
        customer_name: form.name,
        street: form.street || null,
        house_number: form.house_number || null,
        postal_code: form.postal_code || null,
        city: form.city || null,
        address: formatAddress(form),
        use_site_address: form.use_site_address,
        site_street: form.site_street || null,
        site_house_number: form.site_house_number || null,
        site_postal_code: form.site_postal_code || null,
        site_city: form.site_city || null,
        site_contact_name: form.site_contact_name || null,
        site_contact_phone: form.site_contact_phone || null,
        phone: form.phone || null,
        email: form.email || null,
        billing_email: form.billing_email || null,
        vat_number: form.vat_number.trim() || null,
        project_name: form.project_name.trim() || null,
        description: form.description || null,
        technician_id: form.technician_id || null,
        status: form.technician_id ? "toegewezen" : "nieuw",
        activity_id: form.activity_id || null,
        vat_rate: Number(form.vat_rate),
        scheduled_date: form.scheduled_date || null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error || !created) {
      toast.error(error?.message ?? "Aanmaken mislukt");
      return;
    }
    qc.invalidateQueries({ queryKey: ["customers"] });
    setForm(emptyForm);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["work_orders"] });
    toast.success("Taak aangemaakt");
    if (dag) navigate({ to: "/kalender" });
  }

  async function doImport() {
    setBusy(true);
    try {
      const r = await runImport();
      if (r.imported > 0) toast.success(`${r.imported} nieuwe taken aangemaakt`);
      else toast.info(`Geen nieuwe mails voor ${MAILBOX_ADDRESS}`);
      if (r.errors?.length) toast.error(`${r.errors.length} mail(s) konden niet gelezen worden`);
      qc.invalidateQueries({ queryKey: ["work_orders"] });
      qc.invalidateQueries({ queryKey: ['customers'] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ophalen mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-3xl font-black uppercase">Taken</h1>
          <p className="text-sm text-muted-foreground">Klanten uit {MAILBOX_ADDRESS}</p>
          <MailboxConnect />
          <p className="mt-2 text-sm text-muted-foreground">Werkbonmail vanuit info@riory.be</p>
          <WerkbonMailboxConnect />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">+ Taak toevoegen</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nieuwe taak inplannen</DialogTitle>
            </DialogHeader>
            <form onSubmit={addToe} className="grid gap-3">
              <div className="grid gap-1">
                <Label htmlFor="nb-dag">Ingepland op</Label>
                <Input id="nb-dag" type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="nb-klant">Bestaande klant kiezen</Label>
                <Input id="nb-klant" list="nb-klanten" placeholder="Typ om te zoeken…" onChange={(e) => pickCustomer(e.target.value)} />
                <datalist id="nb-klanten">
                  {customers.map((c) => <option key={c.id} value={customerLabel(c)} />)}
                </datalist>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="nb-name">Naam klant</Label>
                <Input id="nb-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-[1fr_6rem] gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="nb-street">Straat</Label>
                  <Input id="nb-street" value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="nb-nr">Nr.</Label>
                  <Input id="nb-nr" value={form.house_number} onChange={(e) => setForm({ ...form, house_number: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-[6rem_1fr] gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="nb-pc">Postcode</Label>
                  <Input id="nb-pc" value={form.postal_code} onChange={(e) => setForm({ ...form, postal_code: e.target.value })} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="nb-city">Plaats</Label>
                  <Input id="nb-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
              </div>
              <SiteAddressFields value={form} onChange={(patch) => setForm((current) => ({ ...current, ...patch, site_street: patch.site_street ?? current.site_street, site_house_number: patch.site_house_number ?? current.site_house_number, site_postal_code: patch.site_postal_code ?? current.site_postal_code, site_city: patch.site_city ?? current.site_city, site_contact_name: patch.site_contact_name ?? current.site_contact_name, site_contact_phone: patch.site_contact_phone ?? current.site_contact_phone }))} />
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="nb-phone">Telefoon</Label>
                  <Input id="nb-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="nb-email">E-mail</Label>
                  <Input id="nb-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
              <div className="grid gap-1">
                <Label htmlFor="nb-billing">E-mail facturatie</Label>
                <Input id="nb-billing" type="email" value={form.billing_email} onChange={(e) => setForm({ ...form, billing_email: e.target.value })} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="nb-vat-number">Btw-nummer klant</Label>
                <Input id="nb-vat-number" value={form.vat_number} onChange={(e) => setForm({ ...form, vat_number: e.target.value, vat_rate: String(vatRateForCustomer(e.target.value, Number(form.vat_rate))) })} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor="nb-project">Project</Label>
                <Input id="nb-project" list="nb-projecten" placeholder="Naam van het project…" value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
                <datalist id="nb-projecten">
                  {selectedProjects.map(p=><option key={p.id} value={p.name}>{p.number} — {formatAddress(p)}</option>)}
                </datalist>
                {selectedProjects.length>0 && <select aria-label="Klantproject kiezen" className="h-10 w-full rounded-md border bg-background px-2" value="" onChange={e=>{const p=selectedProjects.find(x=>x.id===e.target.value);if(p)setForm({...form,project_name:p.name,use_site_address:!!p.street,site_street:p.street??'',site_house_number:p.house_number??'',site_postal_code:p.postal_code??'',site_city:p.city??''});}}><option value="">Project kiezen…</option>{selectedProjects.map(p=><option key={p.id} value={p.id}>{p.number} {p.name}</option>)}</select>}
              </div>
              <div className="grid gap-1">
                <Label htmlFor="nb-desc">Omschrijving</Label>
                <Textarea id="nb-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="grid gap-1">
                  <Label htmlFor="nb-ploeg">Ploeg</Label>
                  <select id="nb-ploeg" className="h-10 w-full rounded-md border bg-background px-2" value={form.technician_id} onChange={(e) => setForm({ ...form, technician_id: e.target.value })}>
                    <option value="">— Later —</option>
                    {opts?.techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="nb-act">Activiteit</Label>
                  <select id="nb-act" className="h-10 w-full rounded-md border bg-background px-2" value={form.activity_id} onChange={(e) => setForm({ ...form, activity_id: e.target.value })}>
                    <option value="">— Kies —</option>
                    {opts?.acts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="nb-btw">Btw</Label>
                  <select id="nb-btw" className="h-10 w-full rounded-md border bg-background px-2" value={form.vat_rate} onChange={(e) => setForm({ ...form, vat_rate: e.target.value })}>
                    {VAT_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                  </select>
                </div>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "Opslaan…" : "Taak aanmaken"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        <Button className="ml-auto" onClick={doImport} disabled={busy}>
          {busy ? "Mails lezen…" : "Mails ophalen"}
        </Button>
      </div>
      <AppointmentMailSync />
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">
            {FILTER_LABELS[f]} ({f === "nieuw" ? newTaskRows(data).length : f === "ingepland" ? plannedTaskRows(data).length : f === "bezig" ? data.filter((w) => activeTimeEntry(w.time_entries)).length : f === "alle" ? data.length : data.filter(w => w.status === f).length})
          </Button>
        ))}
      </div>
      <div className="grid gap-3">
        {rows.length === 0 && <div className="rounded-md border bg-card p-6 text-muted-foreground">Geen taken.</div>}
        {rows.map((w) => (
          <RowLink key={w.id} w={w} label={w.status === "afgetekend" ? "Werkbon" : "Taak"} below={role === "admin" && w.status !== "afgetekend" ? (
            <div className="grid gap-2 border-t pt-3 sm:grid-cols-[auto_1fr_1fr_auto]">
              <Input type="date" aria-label="Dag" className="h-9 bg-background text-foreground" value={w.scheduled_date ?? ""} onChange={(e) => patch(w.id, { scheduled_date: e.target.value || null })} />
              <select aria-label="Ploeg" className="h-9 rounded-md border bg-background px-2 text-foreground" value={w.technician_id ?? ""} onChange={(e) => patch(w.id, { technician_id: e.target.value || null, status: e.target.value ? "toegewezen" : "nieuw" })}>
                <option value="">— Ploeg —</option>
                {opts?.techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select aria-label="Activiteit" className="h-9 rounded-md border bg-background px-2 text-foreground" value={w.activity_id ?? ""} onChange={(e) => patch(w.id, { activity_id: e.target.value || null })}>
                <option value="">— Activiteit —</option>
                {opts?.acts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <Button size="sm" variant={w.urgent ? "destructive" : "outline"} className="h-9" onClick={() => patch(w.id, { urgent: !w.urgent })}>{w.urgent ? "Dringend ✓" : "Markeer dringend"}</Button>
              <CustomerInvite task={w} className="sm:col-span-4 justify-self-start" />
            </div>
          ) : undefined} extra={
            <>
              <span className="text-sm">{w.technicians?.name ?? "Niet toegewezen"}</span>
              <Badge variant={w.status === "afgetekend" ? "secondary" : "default"} className="capitalize">
                {w.status}
              </Badge>
              {role === "admin" && w.status !== "afgetekend" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={quotingId !== null}
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setQuotingId(w.id);
                    try {
                      const q = await makeQuote({ data: { workOrderId: w.id } });
                      await Promise.all([qc.invalidateQueries({ queryKey: ["quotes"] }), qc.invalidateQueries({ queryKey: ["work_orders"] })]);
                      toast.success(`Offerte ${q.number} aangemaakt — vul ze verder aan`);
                      await navigate({ to: "/offertes", search: { bewerk: q.id } });
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Offerte maken mislukt");
                    } finally {
                      setQuotingId(null);
                    }
                  }}
                >
                  <FilePenLine aria-hidden="true" />
                  {quotingId === w.id ? "Offerte maken…" : "Omzetten naar offerte"}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                title="Verwijderen"
                className="text-destructive"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  deleteTask(qc, w.id, `${w.status === "afgetekend" ? "Werkbon" : "Taak"} #${w.number} (${w.customer_name})`);
                }}
              >
                Verwijderen
              </Button>
            </>
          } />
        ))}
      </div>
    </div>
  );
}

type Row = SiteAddressParts & {
  technicians?: { name: string; color: string | null } | null;
  sort_order: number;
  scheduled_date: string | null;
  id: string;
  number: number;
  customer_name: string;
  address: string | null;
  phone: string | null;
  email?: string | null;
  description: string | null;
  status: string;
  urgent?: boolean;
  contract_id?: string | null;
  technician_id?: string | null;
  activity_id?: string | null;
  time_entries: { id: string; started_at: string; ended_at: string | null }[];
};

function TechList({ rows }: { rows: Row[] }) {
  const b = crewBuckets(rows.filter((w) => w.status !== "afgetekend"));
  const done = rows.filter((w) => w.status === "afgetekend");
  const group = (title: string, list: Row[], empty: string) => (
    <section className="space-y-3">
      <h2 className="text-xl font-black uppercase">{title}</h2>
      {list.length === 0 && <div className="rounded-md border bg-card p-4 text-muted-foreground">{empty}</div>}
      {list.map((w) => <RowLink key={w.id} w={w} label="Taak" />)}
    </section>
  );
  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-black uppercase">Mijn taken</h1>
      {group("Vandaag", b.today, "Geen taken vandaag.")}
      {group("Morgen", b.tomorrow, "Geen taken morgen.")}
      {b.unplanned.length > 0 && group("Nog in te plannen", b.unplanned, "")}
      {done.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-black uppercase">Afgetekende werkbonnen</h2>
          {done.map((w) => <RowLink key={w.id} w={w} label="Werkbon" />)}
        </section>
      )}
    </div>
  );
}

function RowLink({ w, label, extra, below }: { w: Row; label: string; extra?: React.ReactNode; below?: React.ReactNode }) {
  const showContact = usePerms()?.showContact ?? false;
  const running = w.time_entries?.find((t) => !t.ended_at);
  const signed = w.status === "afgetekend";
  return (
    <div style={crewStyle(w.technicians?.color)} className={`space-y-3 rounded-md border-l-4 border-primary bg-card p-4 shadow-sm ${isUrgentOpen(w) ? URGENT_RING : ""} ${running ? "task-running" : ""}`}>
      {(isUrgentOpen(w) || w.contract_id) && <div className="flex gap-2 text-xs font-bold">{isUrgentOpen(w) && <span className="animate-pulse rounded bg-destructive px-2 py-0.5 text-destructive-foreground">DRINGEND — vandaag helpen</span>}{w.contract_id && <span className="rounded bg-secondary px-2 py-0.5 text-secondary-foreground">Contract — niet factureren</span>}</div>}
      {running && <RunningTask entries={w.time_entries} crewName={w.technicians?.name} />}
      <Link to="/werkbonnen/$id" params={{ id: w.id }} className="flex flex-wrap items-center gap-4">
        <span className="font-mono text-sm opacity-80">{label} #{w.number}</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold underline-offset-2 hover:underline">{w.customer_name}</div>
          <AddressBlock w={w} />
          {w.description ? (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{w.description}</p>
          ) : (
            <p className="mt-1 text-sm italic opacity-80">Geen omschrijving</p>
          )}
        </div>
        {extra}
      </Link>
      {below}
      {!signed && <TaskActions id={w.id} address={destinationAddress(w)} phone={showContact ? w.phone : null} contactPhone={w.site_contact_phone} contactName={w.site_contact_name} runningEntryId={running?.id ?? null} />}
    </div>
  );
}

/** Het adres waar de ploeg naartoe gaat, volledig en in regels zoals op een envelop. */
function AddressBlock({ w }: { w: Row }) {
  const lines = destinationLines(w);
  return (
    <div className="mt-0.5">
      <div className="text-xs font-bold uppercase tracking-wide opacity-70">{destinationLabel(w)}</div>
      {lines.length ? (
        <div className="break-words font-medium leading-snug">{lines.map((l) => <div key={l}>{l}</div>)}</div>
      ) : (
        <div className="text-muted-foreground">Geen adres</div>
      )}
    </div>
  );
}
