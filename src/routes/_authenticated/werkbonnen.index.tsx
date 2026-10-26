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
import { formatAddress } from "@/lib/address";
import { useRole } from "@/lib/use-role";
import { TaskActions } from "@/components/TaskActions";

export const Route = createFileRoute("/_authenticated/werkbonnen/")({
  head: () => ({ meta: [{ title: "Werkbonnen — Riory" }] }),
  component: Lijst,
});

const FILTERS = ["alle", "nieuw", "toegewezen", "afgetekend"] as const;
const emptyForm = { name: "", street: "", house_number: "", postal_code: "", city: "", phone: "", email: "", description: "" };

function Lijst() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const runImport = useServerFn(importFromMailbox);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("alle");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["work_orders"],
    queryFn: async () =>
      (await supabase.from("work_orders").select("*, technicians(name), time_entries(id, ended_at)").order("created_at", { ascending: false })).data ?? [],
  });
  const role = useRole();
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
        phone: form.phone || null,
        email: form.email || null,
        description: form.description || null,
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
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline">+ Werkbon toevoegen</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Handmatig werkbon toevoegen</DialogTitle>
            </DialogHeader>
            <form onSubmit={addToe} className="grid gap-3">
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
                <Label htmlFor="nb-desc">Omschrijving</Label>
                <Textarea id="nb-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
            </>
          } />
        ))}
      </div>
    </div>
  );
}

type Row = {
  id: string;
  number: number;
  customer_name: string;
  address: string | null;
  phone: string | null;
  status: string;
  time_entries: { id: string; ended_at: string | null }[];
};

function TechList({ rows }: { rows: Row[] }) {
  const open = rows.filter((w) => w.status !== "afgetekend");
  const done = rows.filter((w) => w.status === "afgetekend");
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-3xl font-black uppercase">Mijn taken</h1>
        {open.length === 0 && <div className="rounded-md border bg-card p-6 text-muted-foreground">Geen openstaande taken.</div>}
        {open.map((w) => <RowLink key={w.id} w={w} label="Taak" />)}
      </section>
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
  const running = w.time_entries?.find((t) => !t.ended_at);
  const signed = w.status === "afgetekend";
  return (
    <div className="space-y-3 rounded-md border-l-4 border-primary bg-card p-4 shadow-sm">
      <Link to="/werkbonnen/$id" params={{ id: w.id }} className="flex flex-wrap items-center gap-4">
        <span className="font-mono text-sm text-muted-foreground">{label} #{w.number}</span>
        <div className="min-w-0 flex-1">
          <div className="font-bold underline-offset-2 hover:underline">{w.customer_name}</div>
          <div className="truncate text-sm text-muted-foreground">{w.address ?? "Geen adres"}</div>
        </div>
        {running && <span className="font-mono text-sm font-bold text-primary">● tijd loopt</span>}
        {extra}
      </Link>
      {!signed && <TaskActions id={w.id} address={w.address} phone={w.phone} runningEntryId={running?.id ?? null} />}
    </div>
  );
}
