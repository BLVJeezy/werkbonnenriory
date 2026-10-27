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
import { destinationAddress, formatAddress, type SiteAddressParts } from "@/lib/address";
import { usePerms, useRole } from "@/lib/use-role";
import { TaskActions } from "@/components/TaskActions";
import { MailboxConnect, WerkbonMailboxConnect } from "@/components/MailboxConnect";
import { deleteTask } from "@/lib/delete-task";
import { crewStyle } from "@/lib/crew-color";
import { VAT_RATES } from "@/lib/billing";
import { crewBuckets } from "@/lib/schedule";

export const Route = createFileRoute("/_authenticated/werkbonnen/")({
  head: () => ({ meta: [{ title: "Werkbonnen — Riory" }, { name: "description", content: "Taken en afgetekende werkbonnen met klant- en werfgegevens." }, { property: "og:title", content: "Werkbonnen — Riory" }, { property: "og:description", content: "Taken en afgetekende werkbonnen met klant- en werfgegevens." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (s: Record<string, unknown>): { dag?: string } =>
    typeof s["dag"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["dag"]) ? { dag: s["dag"] } : {},
  component: Lijst,
});

const FILTERS = ["alle", "nieuw", "toegewezen", "afgetekend"] as const;
const emptyForm = { name: "", street: "", house_number: "", postal_code: "", city: "", phone: "", email: "", vat_number: "", description: "", technician_id: "", activity_id: "", vat_rate: "21", scheduled_date: "", use_site_address: false, site_street: "", site_house_number: "", site_postal_code: "", site_city: "" };

function Lijst() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const runImport = useServerFn(importFromMailbox);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("alle");
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
    queryFn: async () =>
      (await supabase.from("work_orders").select("*, technicians(name, color), time_entries(id, ended_at)").order("created_at", { ascending: false })).data ?? [],
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
  const rows = filter === "alle" ? data : data.filter((w) => w.status === filter);
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
        phone: form.phone || null,
        email: form.email || null,
        vat_number: form.vat_number.trim() || null,
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
    setForm(emptyForm);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["work_orders"] });
    navigate({ to: "/werkbonnen/$id", params: { id: created.id } });
  }

  async function doImport() {
    setBusy(true);
    try {
      const r = await runImport();
      if (r.imported > 0) toast.success(`${r.imported} nieuwe werkbon(nen) aangemaakt`);
      else toast.info(`Geen nieuwe mails voor ${MAILBOX_ADDRESS}`);
      if (r.errors?.length) toast.error(`${r.errors.length} mail(s) konden niet gelezen worden`);
      qc.invalidateQueries({ queryKey: ["work_orders"] });
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
          <h1 className="text-3xl font-black uppercase">Werkbonnen</h1>
          <p className="text-sm text-muted-foreground">Klanten uit {MAILBOX_ADDRESS}</p>
          <MailboxConnect />
          <p className="mt-2 text-sm text-muted-foreground">Werkbonmail vanuit info@riory.be</p>
          <WerkbonMailboxConnect />
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">+ Werkbon toevoegen</Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Handmatig werkbon toevoegen</DialogTitle>
            </DialogHeader>
            <form onSubmit={addToe} className="grid gap-3">
              <div className="grid gap-1">
                <Label htmlFor="nb-dag">Ingepland op</Label>
                <Input id="nb-dag" type="date" value={form.scheduled_date} onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} />
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
              <SiteAddressFields value={form} onChange={(patch) => setForm((current) => ({ ...current, ...patch, site_street: patch.site_street ?? current.site_street, site_house_number: patch.site_house_number ?? current.site_house_number, site_postal_code: patch.site_postal_code ?? current.site_postal_code, site_city: patch.site_city ?? current.site_city }))} />
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
                <Label htmlFor="nb-vat-number">Btw-nummer klant</Label>
                <Input id="nb-vat-number" value={form.vat_number} onChange={(e) => setForm({ ...form, vat_number: e.target.value })} />
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
                {saving ? "Opslaan…" : "Werkbon aanmaken"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        <Button className="ml-auto" onClick={doImport} disabled={busy}>
          {busy ? "Mails lezen…" : "Mails ophalen"}
        </Button>
      </div>
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">
            {f}
          </Button>
        ))}
      </div>
      <div className="grid gap-3">
        {rows.length === 0 && <div className="rounded-md border bg-card p-6 text-muted-foreground">Geen werkbonnen.</div>}
        {rows.map((w) => (
          <RowLink key={w.id} w={w} label={w.status === "afgetekend" ? "Werkbon" : "Taak"} extra={
            <>
              <span className="text-sm">{w.technicians?.name ?? "Niet toegewezen"}</span>
              <Badge variant={w.status === "afgetekend" ? "secondary" : "default"} className="capitalize">
                {w.status}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
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
  description: string | null;
  status: string;
  time_entries: { id: string; ended_at: string | null }[];
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

function RowLink({ w, label, extra }: { w: Row; label: string; extra?: React.ReactNode }) {
  const showContact = usePerms()?.showContact ?? false;
  const running = w.time_entries?.find((t) => !t.ended_at);
  const signed = w.status === "afgetekend";
  return (
    <div style={crewStyle(w.technicians?.color)} className="space-y-3 rounded-md border-l-4 border-primary bg-card p-4 shadow-sm">
      <Link to="/werkbonnen/$id" params={{ id: w.id }} className="flex flex-wrap items-center gap-4">
        <span className="font-mono text-sm opacity-80">{label} #{w.number}</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold underline-offset-2 hover:underline">{w.customer_name}</div>
          <div className="truncate text-sm opacity-80">{destinationAddress(w) ?? "Geen adres"}</div>
          {w.description ? (
            <p className="mt-1 line-clamp-3 whitespace-pre-line text-sm leading-snug">{w.description}</p>
          ) : (
            <p className="mt-1 text-sm italic opacity-80">Geen omschrijving</p>
          )}
        </div>
        {running && <span className="font-mono text-sm font-bold text-primary">● tijd loopt</span>}
        {extra}
      </Link>
      {!signed && <TaskActions id={w.id} address={destinationAddress(w)} phone={showContact ? w.phone : null} runningEntryId={running?.id ?? null} />}
    </div>
  );
}
