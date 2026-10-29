import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Database } from "@/integrations/supabase/types";
import { SignaturePad } from "@/components/SignaturePad";
import { formatDuration, totalSeconds } from "@/lib/time";
import { SiteAddressFields } from "@/components/SiteAddressFields";
import { destinationAddress, destinationLabel, destinationLines, formatAddress, type AddressParts, type SiteAddressParts } from "@/lib/address";
import { usePerms, useRole } from "@/lib/use-role";
import { billableHours, computeTotals, euro, VAT_RATES } from "@/lib/billing";
import { computeDistance } from "@/lib/distance.functions";
import { TaskActions } from "@/components/TaskActions";
import { WorkOrderPhotos } from "@/components/WorkOrderPhotos";
import { sendWerkbonEmail } from "@/lib/werkbon-mail.functions";
import { quoteFromTask } from "@/lib/quotes.functions";
import { useServerFn } from "@tanstack/react-start";
import { completeTask } from "@/lib/task-completion";
import { vatRateForCustomer } from "@/lib/vat-number";
import { AppointmentPanel } from '@/components/AppointmentPanel';
import { removeWorkOrderPayment } from '@/lib/work-order-payment.functions';
import { ReassignCustomer } from '@/components/ReassignCustomer';
import { DocumentReport } from '@/components/DocumentReport';
import { CustomerInvite } from '@/components/CustomerInvite';
import { isUrgentOpen, URGENT_RING } from '@/lib/urgent';
import { WorkOrderPreview } from '@/components/WorkOrderPreview';

export const Route = createFileRoute("/_authenticated/werkbonnen/$id")({
  head: () => ({ meta: [{ title: "Werkbon — Riory" }, { name: "description", content: "Klant en werfadres, tijdregistratie, materialen en aftekenen van een Riory-werkbon." }, { property: "og:title", content: "Werkbon — Riory" }, { property: "og:description", content: "Klant en werfadres, tijdregistratie, materialen en aftekenen van een Riory-werkbon." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Detail,
});

function Detail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const key = ["work_order", id];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [w, t, m, techs, prods, acts, st] = await Promise.all([
        supabase.from("work_orders").select("*").eq("id", id).single(),
        supabase.from("time_entries").select("*").eq("work_order_id", id).order("started_at"),
        supabase.from("materials").select("*").eq("work_order_id", id).order("created_at"),
        supabase.from("technicians").select("*").order("name"),
        supabase.from("products").select("*").order("name"),
        supabase.from("activities").select("*").order("name"),
        supabase.from("settings").select("*").eq("id", 1).single(),
      ]);
      return {
        wo: w.data,
        times: t.data ?? [],
        mats: m.data ?? [],
        techs: techs.data ?? [],
        prods: prods.data ?? [],
        acts: acts.data ?? [],
        settings: st.data,
      };
    },
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["work_orders"] });
  };

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const role = useRole();
  const perms = usePerms() ?? { showPrices: false, showContact: false, canPayment: false, showSigned: false };
  const money = (n: number) => (perms.showPrices ? euro(n) : "");
  const [mat, setMat] = useState({ productId: "", quantity: "1" });
  const [signature, setSignature] = useState<string | null>(null);
  const [signedName, setSignedName] = useState("");
  const calcKm = useServerFn(computeDistance);
  const mailWerkbon = useServerFn(sendWerkbonEmail);
  const makeQuote = useServerFn(quoteFromTask);
  const removePayment = useServerFn(removeWorkOrderPayment);
  const [removingPayment,setRemovingPayment] = useState(false);
  const [kmTried, setKmTried] = useState<string | null>(null);
  const woAddr = data?.wo ? destinationAddress(data.wo) : null;
  const needKm = !!data?.wo && data.wo.status !== "afgetekend" && data.wo.distance_km == null && !!woAddr;
  useEffect(() => {
    if (!needKm || kmTried === woAddr) return;
    setKmTried(woAddr);
    calcKm({ data: { id } })
      .then((r) => r.km != null && refresh())
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needKm, woAddr]);

  if (!data?.wo) return <p className="text-muted-foreground">Laden…</p>;
  const { wo, times, mats, techs, acts, settings } = data;
  const locked = wo.status === "afgetekend";
  const isAdmin = role === "admin";
  const prods = data.prods.filter((p) => isAdmin || !p.admin_only);
  const infoLocked = !isAdmin;
  const matLocked = locked && !isAdmin;
  const kind = locked ? "Werkbon" : "Taak";
  const saveAddr = (patch: Partial<Record<"street" | "house_number" | "postal_code" | "city", string>>) =>
    update({ ...patch, address: formatAddress({ ...wo, ...patch }), distance_km: null });
  const running = times.find((t) => !t.ended_at);
  const total = totalSeconds(times, now);
  const activity = acts.find((a) => a.id === wo.activity_id);
  const totals = computeTotals({
    seconds: total,
    hourlyRate: Number(activity?.hourly_rate ?? 0),
    distanceKm: wo.distance_km == null ? null : Number(wo.distance_km),
    kmRate: Number(settings?.km_rate ?? 0),
    materials: mats.map((m) => ({ quantity: Number(m.quantity), unit_price: Number(m.unit_price) })),
    vatRate: Number(wo.vat_rate),
    warranty: wo.warranty,
  });

  async function update(patch: Database["public"]["Tables"]["work_orders"]["Update"]) {
    const { error } = await supabase.from("work_orders").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    refresh();
    return !error;
  }

  async function mailNaarKlant() {
    if (!wo.email) return;
    const r = await mailWerkbon({ data: { workOrderId: id } });
    if (r.sent) toast.success(`Werkbon gemaild naar ${wo.email}`);
    else if (r.reason === "reconnect_required") toast.error("Koppel de mailbox info@riory.be opnieuw om te kunnen mailen");
    else if (r.reason === "mailbox_not_connected") toast.error("Koppel eerst de mailbox info@riory.be op de takenpagina");
    else toast.error("Mail versturen mislukt");
  }

  async function toggleTimer() {
    if (running) {
      await supabase.from("time_entries").update({ ended_at: new Date().toISOString() }).eq("id", running.id);
    } else {
      await supabase.from("time_entries").insert({ work_order_id: id });
    }
    refresh();
  }

  async function finishTask(patch: Database["public"]["Tables"]["work_orders"]["Update"]) {
    try {
      await completeTask({
        save: () => update(patch),
        mail: mailNaarKlant,
        afterSaved: async () => {
          if (role === "technician") await navigate({ to: "/werkbonnen", search: {} });
        },
      });
    } catch {
      toast.error("Taak afgerond, maar de werkbonmail kon niet verstuurd worden");
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/werkbonnen" className="no-print text-sm text-muted-foreground underline">
        {isAdmin ? "← Alle taken" : "← Mijn taken"}
      </Link>
      {isUrgentOpen(wo) && (
        <div className={`no-print rounded-md bg-destructive p-4 text-destructive-foreground ${URGENT_RING}`}>
          <p className="animate-pulse text-xl font-black uppercase">⚠ Dringend — vandaag helpen</p>
          <p className="text-sm">Deze opdracht werd als dringend aangeduid. Behandel ze met voorrang.</p>
        </div>
      )}
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-3xl font-black uppercase">{kind} #{wo.number}</h1>
        <span className="rounded bg-accent px-2 py-0.5 text-sm font-bold capitalize text-accent-foreground">{wo.status}</span>
        <div className="no-print ml-auto flex flex-wrap gap-2">
          {(role === 'admin' || role === 'technician') && <WorkOrderPreview workOrderId={id} />}
          <Button variant="outline" onClick={() => window.print()}>Afdrukken</Button>
          {isAdmin && locked && <DocumentReport id={id} type="werkbon" />}
          {locked && wo.email && (
            <Button variant="outline" onClick={mailNaarKlant}>Mail naar klant</Button>
          )}
          {isAdmin && locked && <ReassignCustomer wo={{ ...wo, vat_rate: Number(wo.vat_rate) }} onDone={() => { refresh(); qc.invalidateQueries({ queryKey: ["work_orders"] }); }} />}
          {isAdmin && locked && (
            <Button variant="outline" onClick={() => confirm("Handtekening wissen en opnieuw openen als taak?") && update({ status: wo.technician_id ? "toegewezen" : "nieuw", signature: null, signed_name: null, signed_at: null })}>
              Heropenen
            </Button>
          )}
          {isAdmin && !locked && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  const q = await makeQuote({ data: { workOrderId: id } });
                  refresh();
                  qc.invalidateQueries({ queryKey: ["quotes"] });
                  toast.success(`Offerte ${q.number} aangemaakt — vul ze verder aan`);
                  navigate({ to: "/offertes", search: { bewerk: q.id } });
                } catch (e) { toast.error(e instanceof Error ? e.message : "Offerte maken mislukt"); }
              }}
            >
              Omzetten naar offerte
            </Button>
          )}
          {isAdmin && (
            <Button
              variant="destructive"
              onClick={async () => {
                if (!confirm(`${kind} #${wo.number} definitief verwijderen?`)) return;
                const { error } = await supabase.from("work_orders").delete().eq("id", id);
                if (error) { toast.error(error.message); return; }
                qc.invalidateQueries({ queryKey: ["work_orders"] });
                toast.success("Verwijderd");
                navigate({ to: "/werkbonnen" });
              }}
            >
              Verwijderen
            </Button>
          )}
        </div>
      </div>

      <section className="grid gap-4 rounded-md border-2 border-primary bg-card p-4 sm:grid-cols-[1fr_10rem]">
        <div className="space-y-1">
          <Label>Activiteit</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-2 text-lg font-bold"
            value={wo.activity_id ?? ""}
            disabled={infoLocked}
            onChange={(e) => update({ activity_id: e.target.value || null })}
          >
            <option value="">{acts.length ? "— Kies activiteit —" : "Nog geen activiteiten (zie Tarieven)"}</option>
            {acts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}{perms.showPrices && ` — ${money(Number(a.hourly_rate))}/u`}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Btw-tarief</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-2 text-lg font-bold"
            value={String(Number(wo.vat_rate))}
            disabled={infoLocked}
            onChange={(e) => update({ vat_rate: Number(e.target.value) })}
          >
            {VAT_RATES.map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </select>
        </div>
      </section>

      <TaskActions id={id} address={destinationAddress(wo)} phone={perms.showContact ? wo.phone : null} contactPhone={wo.site_contact_phone} contactName={wo.site_contact_name} runningEntryId={running?.id ?? null} showTimer={false} manualTime={!!techs.find((t) => t.id === wo.technician_id)?.manual_time_entry} />

      <section className="grid gap-4 rounded-md border bg-card p-4 sm:grid-cols-2">
        <Field label="Klant" value={wo.customer_name} disabled={infoLocked} onSave={(v) => update({ customer_name: v })} />
        <Field label="Project" value={wo.project_name ?? ""} disabled={infoLocked} onSave={(v) => update({ project_name: v.trim() || null })} />
        {(isAdmin || perms.showContact) && <Field label="Btw-nummer klant" value={wo.vat_number ?? ""} disabled={infoLocked} onSave={(v) => update({ vat_number: v.trim() || null, vat_rate: vatRateForCustomer(v, Number(wo.vat_rate), undefined, { postalCode: wo.postal_code }) })} />}
        {isAdmin ? (
          <>
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <Field label="Straat" value={wo.street ?? (wo.house_number || wo.city ? "" : wo.address ?? "")} onSave={(v) => saveAddr({ street: v })} />
              <Field label="Nr." value={wo.house_number ?? ""} onSave={(v) => saveAddr({ house_number: v })} />
            </div>
            <div className="grid grid-cols-[6rem_1fr] gap-3">
              <Field label="Postcode" value={wo.postal_code ?? ""} onSave={(v) => saveAddr({ postal_code: v })} />
              <Field label="Plaats" value={wo.city ?? ""} onSave={(v) => saveAddr({ city: v })} />
            </div>
            <SiteAddressFields
              value={wo}
              saveOnBlur
              onChange={(patch) => update("site_contact_name" in patch || "site_contact_phone" in patch ? patch : { ...patch, distance_km: null })}
            />
          </>
        ) : (
          <ReadOnlyAddress wo={wo} />
        )}
        {perms.showContact && <Field label="Telefoon" value={wo.phone ?? ""} disabled={infoLocked} onSave={(v) => update({ phone: v })} />}
        {perms.showContact && <Field label="E-mail" value={wo.email ?? ""} disabled={infoLocked} onSave={(v) => update({ email: v })} />}
        {perms.showContact && <Field label="E-mail facturatie" value={wo.billing_email ?? ""} disabled={infoLocked} onSave={(v) => update({ billing_email: v.trim() || null })} />}
        <div className="space-y-1 sm:col-span-2">
          <Label>Omschrijving</Label>
          {isAdmin ? (
            <Textarea
              defaultValue={wo.description ?? ""}
              disabled={infoLocked}
              onBlur={(e) => e.target.value !== (wo.description ?? "") && update({ description: e.target.value })}
            />
          ) : (
            <p className="whitespace-pre-wrap break-words text-base leading-relaxed [overflow-wrap:anywhere]">{wo.description || "Geen omschrijving"}</p>
          )}
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Uitgevoerde werken (door de ploeg)</Label>
          <Textarea
            key={wo.work_notes ?? ""}
            rows={4}
            placeholder="Beschrijf hier wat er gedaan werd…"
            defaultValue={wo.work_notes ?? ""}
            disabled={matLocked}
            onBlur={(e) => e.target.value !== (wo.work_notes ?? "") && update({ work_notes: e.target.value.trim() || null })}
          />
        </div>
        <div className="space-y-1">
          <Label>Ploeg</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-2"
            value={wo.technician_id ?? ""}
            disabled={infoLocked}
            onChange={(e) =>
              update({ technician_id: e.target.value || null, status: e.target.value ? "toegewezen" : "nieuw" })
            }
          >
            <option value="">— Niet toegewezen —</option>
            {techs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {wo.source_subject && (
          <div className="text-sm text-muted-foreground sm:self-end">Mail: “{wo.source_subject}”</div>
        )}
      </section>

      <label className="flex cursor-pointer items-center gap-3 rounded-md border-2 border-primary bg-card p-4 text-lg font-bold">
        <input
          type="checkbox"
          className="h-6 w-6 accent-[var(--primary)]"
          checked={wo.warranty}
          disabled={!isAdmin && (locked || !!wo.paid_at)}
          onChange={(e) => update({ warranty: e.target.checked })}
        />
        Onder garantie
        <span className="text-sm font-normal text-muted-foreground">(eerste uur en kilometers niet aangerekend)</span>
      </label>

      <section className="rounded-md border bg-card p-4">
        <h2 className="mb-3 text-lg font-black uppercase">Tijd</h2>
        <div className="flex flex-wrap items-center gap-4">
          <div className="font-mono text-4xl font-semibold tabular-nums">{formatDuration(total)}</div>
          {!locked && (
            <Button size="lg" variant={running ? "destructive" : "default"} onClick={toggleTimer} className="min-w-32 text-lg">
              {running ? "■ Stop" : "▶ Start"}
            </Button>
          )}
        </div>
        {times.length > 0 && !isAdmin && (
          <ul className="mt-3 space-y-1 font-mono text-sm text-muted-foreground">
            {times.map((t) => (
              <li key={t.id}>
                {new Date(t.started_at).toLocaleString("nl-BE")} →{" "}
                {t.ended_at ? new Date(t.ended_at).toLocaleTimeString("nl-BE") : "bezig"} (
                {formatDuration(totalSeconds([t], now))})
              </li>
            ))}
          </ul>
        )}
        {isAdmin && (
          <div className="mt-3 space-y-2">
            {times.map((t) => (
              <div key={t.id + t.started_at + (t.ended_at ?? "")} className="flex flex-wrap items-center gap-2 font-mono text-sm">
                <Input
                  type="datetime-local"
                  className="w-56"
                  defaultValue={toLocalInput(t.started_at)}
                  onBlur={async (e) => {
                    if (!e.target.value || e.target.value === toLocalInput(t.started_at)) return;
                    const { error } = await supabase.from("time_entries").update({ started_at: new Date(e.target.value).toISOString() }).eq("id", t.id);
                    if (error) toast.error(error.message);
                    refresh();
                  }}
                />
                →
                <Input
                  type="datetime-local"
                  className="w-56"
                  defaultValue={t.ended_at ? toLocalInput(t.ended_at) : ""}
                  onBlur={async (e) => {
                    if (!e.target.value || (t.ended_at && e.target.value === toLocalInput(t.ended_at))) return;
                    const { error } = await supabase.from("time_entries").update({ ended_at: new Date(e.target.value).toISOString() }).eq("id", t.id);
                    if (error) toast.error(error.message);
                    refresh();
                  }}
                />
                <span className="text-muted-foreground">({formatDuration(totalSeconds([t], now))})</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm("Deze tijdregistratie verwijderen?")) return;
                    await supabase.from("time_entries").delete().eq("id", t.id);
                    refresh();
                  }}
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const end = new Date();
                const start = new Date(end.getTime() - 3600_000);
                const { error } = await supabase.from("time_entries").insert({ work_order_id: id, started_at: start.toISOString(), ended_at: end.toISOString() });
                if (error) toast.error(error.message);
                refresh();
              }}
            >
              + Tijd toevoegen
            </Button>
          </div>
        )}
      </section>

      <section className="rounded-md border bg-card p-4">
        <h2 className="mb-3 text-lg font-black uppercase">Materialen</h2>
        <ul className="mb-3 divide-y">
          {mats.length === 0 && <li className="py-2 text-muted-foreground">Nog geen materialen.</li>}
          {mats.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <span className="w-20 font-mono">
                {m.quantity} {m.unit}
              </span>
              <span className="flex-1">{m.name}</span>
              <span className="font-mono text-sm">{money(Number(m.quantity) * Number(m.unit_price))}</span>
              {!matLocked && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await supabase.from("materials").delete().eq("id", m.id);
                    refresh();
                  }}
                >
                  ✕
                </Button>
              )}
            </li>
          ))}
        </ul>
        {!matLocked && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const p = prods.find((x) => x.id === mat.productId);
              if (!p) return;
              const { error } = await supabase
                .from("materials")
                .insert({ work_order_id: id, product_id: p.id, name: p.name, quantity: Number(mat.quantity) || 1, unit: p.unit, unit_price: Number(p.price) });
              if (error) {
                toast.error(error.message);
                return;
              }
              setMat({ productId: "", quantity: "1" });
              refresh();
            }}
          >
            <Input className="w-20" type="number" step="any" min="0" value={mat.quantity} onChange={(e) => setMat({ ...mat, quantity: e.target.value })} />
            <select
              required
              className="h-9 min-w-48 flex-1 rounded-md border bg-background px-2"
              value={mat.productId}
              onChange={(e) => setMat({ ...mat, productId: e.target.value })}
            >
              <option value="">{prods.length ? "— Kies product —" : "Nog geen producten aangemaakt"}</option>
              {[...prods].sort((a, b) => (a.alias || a.name).localeCompare(b.alias || b.name)).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.alias ? `${p.alias} — ${p.name}` : p.name} ({p.unit}){perms.showPrices && ` — ${money(Number(p.price))}`}
                </option>
              ))}
            </select>
            <Button>Toevoegen</Button>
          </form>
        )}
      </section>

      <WorkOrderPhotos workOrderId={id} locked={matLocked} />
      {isAdmin && !locked && <AppointmentPanel id={id} external={!!techs.find(t=>t.id===wo.technician_id)?.external_planning} scheduled={!!wo.scheduled_date} />}
      {isAdmin && !locked && <section className="no-print space-y-2 border-t pt-4">
        <h2 className="text-lg font-black uppercase">Klant uitnodigen</h2>
        <p className="text-sm text-muted-foreground">Kies standaardvakken (ochtend 08:00–12:00 of namiddag 13:00–17:00) en mail de klant een keuzelink. Bij bevestiging komt de afspraak automatisch in de agenda.</p>
        <CustomerInvite task={wo} size="default" />
      </section>}

      {(perms.showPrices || perms.canPayment) && <section className="rounded-md border bg-card p-4">
        <h2 className="mb-3 text-lg font-black uppercase">Afrekening</h2>
        {perms.showPrices && <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 font-mono text-sm">
          <dt>
            Arbeid: {billableHours(total).toLocaleString("nl-BE")} u{wo.warranty && " − 1 u garantie"} × {euro(Number(activity?.hourly_rate ?? 0))}
            {!activity && <span className="text-destructive"> (kies activiteit)</span>}
          </dt>
          <dd className="text-right">{euro(totals.labour)}</dd>
          <dt>
            Kilometers:{" "}
            {wo.distance_km == null
              ? woAddr
                ? "berekenen…"
                : "geen adres"
              : `${Number(wo.distance_km).toLocaleString("nl-BE")} km heen en terug × ${euro(Number(settings?.km_rate ?? 0))}${wo.warranty ? " (garantie: gratis)" : ""}`}
          </dt>
          <dd className="text-right">{euro(totals.km)}</dd>
          <dt>Materialen</dt>
          <dd className="text-right">{euro(totals.materials)}</dd>
          <dt className="border-t pt-1">Totaal excl. btw</dt>
          <dd className="border-t pt-1 text-right">{euro(totals.net)}</dd>
          <dt>Btw {Number(wo.vat_rate)}%</dt>
          <dd className="text-right">{euro(totals.vat)}</dd>
          <dt className="text-lg font-black">Te betalen</dt>
          <dd className="text-right text-lg font-black">{euro(totals.total)}</dd>
        </dl>}
        {perms.showPrices && <p className="mt-2 text-xs text-muted-foreground">Eerste uur volledig, daarna per begonnen kwartier.</p>}
        {isAdmin && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field
              label="Kilometers (heen en terug)"
              value={wo.distance_km == null ? "" : String(wo.distance_km)}
              onSave={(v) => update({ distance_km: v.trim() === "" ? null : Number(v.replace(",", ".")) })}
            />
            {wo.paid_at && (
              <>
                <Field
                  label="Betaald bedrag (€)"
                  value={String(wo.paid_amount ?? "")}
                  onSave={(v) => update({ paid_amount: Number(v.replace(",", ".")) || 0 })}
                />
                <div className="space-y-1">
                  <Label>Betaalwijze</Label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2"
                    value={wo.paid_method ?? ""}
                    onChange={(e) => update({ paid_method: e.target.value })}
                  >
                    {["cash", "Bancontact", "overschrijving"].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        )}
        <div className="mt-4 space-y-2">
          {isAdmin && wo.paid_at && <Button variant="destructive" disabled={removingPayment} onClick={async()=>{
            if(!confirm(`Betaling van ${euro(Number(wo.paid_amount))} verwijderen? Deze werkbon blijft afgesloten; de handtekening en werkgegevens blijven behouden. Eventuele factuurbetalingen blijven ongewijzigd.`))return;
            setRemovingPayment(true);
            try {await removePayment({data:{id}});refresh();qc.invalidateQueries({queryKey:['invoices']});toast.success('Betaling verwijderd; werkbon staat niet meer als betaald');}
            catch(e){toast.error(e instanceof Error?e.message:'Betaling verwijderen mislukt');}
            finally{setRemovingPayment(false);}
          }}>{removingPayment?'Verwijderen…':'Betaling verwijderen'}</Button>}
          {!perms.canPayment ? null : wo.paid_at ? (
            <p className="rounded bg-accent p-3 font-bold text-accent-foreground">
              Betaald: {euro(Number(wo.paid_amount))} via {wo.paid_method} op {new Date(wo.paid_at).toLocaleString("nl-BE")}
              {isAdmin && Math.abs(Number(wo.paid_amount) - totals.total) > 0.005 && (
                <Button size="sm" variant="outline" className="ml-3" onClick={() => update({ paid_amount: totals.total })}>
                  Bedrag gelijkzetten aan totaal ({euro(totals.total)})
                </Button>
              )}
            </p>
          ) : !locked ? (
            <>
              <Label>Direct afrekenen met de klant</Label>
              <div className="flex flex-wrap gap-2">
                {["cash", "Bancontact", "overschrijving"].map((m) => (
                  <Button
                    key={m}
                    variant="outline"
                    disabled={!!running}
                    onClick={async () => {
                      if (!confirm(`${euro(totals.total)} ontvangen via ${m}? De taak wordt dan afgesloten als werkbon.`)) return;
                      await finishTask({ paid_method: m, paid_amount: totals.total, paid_at: new Date().toISOString(), status: "afgetekend", signed_at: new Date().toISOString() });
                    }}
                  >
                    Betaald met {m}
                  </Button>
                ))}
              </div>
              {running && <p className="text-sm text-muted-foreground">Stop eerst de tijd.</p>}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Niet ter plaatse afgerekend.</p>
          )}
        </div>
      </section>}

      <section className="rounded-md border-2 border-primary bg-card p-4">
        <h2 className="mb-3 text-lg font-black uppercase">Aftekenen</h2>
        {locked ? (
          <div className="space-y-2">
            {wo.signature && <img src={wo.signature} alt="Handtekening klant" className="h-40 rounded border bg-background" />}
            <p>
              {wo.signed_name ? <>Afgetekend door <strong>{wo.signed_name}</strong></> : wo.paid_at ? "Afgesloten na betaling" : "Werkbon afgesloten"} op {wo.signed_at && new Date(wo.signed_at).toLocaleString("nl-BE")}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <SignaturePad onChange={setSignature} />
            <Input placeholder="Naam klant" value={signedName} onChange={(e) => setSignedName(e.target.value)} />
            <Button
              size="lg"
              disabled={!signature || !signedName || !!running}
              onClick={async () => {
                await finishTask({ signature, signed_name: signedName, signed_at: new Date().toISOString(), status: "afgetekend" });
              }}
            >
              Aftekenen → werkbon
            </Button>
            {running && <p className="text-sm text-muted-foreground">Stop eerst de tijd.</p>}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Adres voor de ploeg: volledig en leesbaar, in regels zoals op een envelop,
 * met de contactpersoon ter plaatse en het klantadres als dat afwijkt.
 */
function ReadOnlyAddress({ wo }: { wo: AddressParts & SiteAddressParts & { address?: string | null } }) {
  const lines = destinationLines(wo);
  const klant = formatAddress(wo);
  const bestemming = destinationAddress(wo);
  return (
    <div className="rounded-md border-2 border-primary bg-muted/30 p-3 sm:col-span-2">
      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{destinationLabel(wo)}</div>
      {lines.length ? (
        <div className="break-words text-lg font-bold leading-snug">{lines.map((l) => <div key={l}>{l}</div>)}</div>
      ) : (
        <div className="text-lg font-bold text-muted-foreground">Geen adres ingevuld</div>
      )}
      {wo.use_site_address && !!wo.site_contact_name?.trim() && (
        <div className="mt-2 text-sm">
          Contactpersoon werf: <span className="font-semibold">{wo.site_contact_name}</span>
          {!!wo.site_contact_phone?.trim() && ` · ${wo.site_contact_phone}`}
        </div>
      )}
      {wo.use_site_address && !!klant && klant !== bestemming && (
        <div className="mt-1 text-sm text-muted-foreground">
          Klantadres: <span className="break-words">{klant}</span>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, disabled, onSave }: { label: string; value: string; disabled?: boolean; onSave: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input key={value} defaultValue={value} disabled={disabled} onBlur={(e) => e.target.value !== value && onSave(e.target.value)} />
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
