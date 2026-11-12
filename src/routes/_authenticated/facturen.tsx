import { OpenEye } from "@/components/OpenEye";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Fragment, useState } from "react";
import { SortTh, Th, rowTint, tableCls, useSort } from "@/components/SortTable";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { euro, workOrderRevenue } from "@/lib/billing";
import { totalSeconds, type TimeEntry } from "@/lib/time";
import { invoiceRowState, workOrderRowState } from "@/lib/invoice-row-state";
import { werkbonNr } from "@/lib/werkbon-number";
import { AccountantPackage } from "@/components/AccountantPackage";
import { createCreditNote, createInvoices, createSubcontractInvoices, invoicePdf, sendInvoiceByPost, sendInvoiceCopy, sendInvoices } from "@/lib/invoices.functions";
import { sendConfirmText } from "@/lib/invoice-delivery";
import { isInvoiceEditable } from "@/lib/invoice";
import { QrCode, Trash2 } from "lucide-react";
import { deleteSelectedWorkOrders } from "@/lib/delete-task";
import { PaymentReminders } from "@/components/PaymentReminders";
import { NewInvoice } from "@/components/NewInvoice";
import { DocumentReport } from '@/components/DocumentReport';
import { InvoiceMailboxConnect } from '@/components/MailboxConnect';
import { WorkOrderPreview } from '@/components/WorkOrderPreview';
import { sendWerkbonEmail } from '@/lib/werkbon-mail.functions';
import { InvoicePaymentDetails } from '@/components/InvoicePaymentDetails';
import { invoicePaymentReference } from '@/lib/invoice-payment-reference';
import { CreditNoteSettle } from '@/components/CreditNoteSettle';

export const Route = createFileRoute("/_authenticated/facturen")({
  head: () => ({ meta: [{ title: "Facturen — Riory Werkbonnen" }, { name: "description", content: "Riory-facturen als PDF naar klanten en als UBL naar OkiOki." }, { property: "og:title", content: "Facturen — Riory Werkbonnen" }, { property: "og:description", content: "Riory-facturen als PDF naar klanten en als UBL naar OkiOki." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Facturen,
});

const STATUS: Record<string, string> = { concept: "Te verzenden", verzonden: "Verzonden", fout: "Mislukt" };

type TodoRow = {
  id: string;
  number: number | null;
  customer_name: string;
  signed_at: string | null;
  paid_amount: number | null;
  paid_at: string | null;
  vat_number: string | null;
  scheduled_date: string | null;
  scheduled_from: string | null;
  scheduled_until: string | null;
  activity_id: string | null;
  distance_km: number | null;
  vat_rate: number;
  warranty: boolean;
  no_invoice: boolean;
  subcontract_auto: boolean;
  time_entries: TimeEntry[];
  materials: { quantity: number; unit_price: number }[];
  technicians: { name: string } | null;
};

function woWhen(w: { scheduled_date: string | null; scheduled_from: string | null; scheduled_until: string | null; signed_at: string | null }) {
  const day = w.scheduled_date ? new Date(`${w.scheduled_date}T00:00`).toLocaleDateString("nl-BE") : w.signed_at ? new Date(w.signed_at).toLocaleDateString("nl-BE") : "—";
  const time = w.scheduled_from ? ` ${w.scheduled_from.slice(0, 5)}${w.scheduled_until ? `–${w.scheduled_until.slice(0, 5)}` : ""}` : w.signed_at ? ` ${new Date(w.signed_at).toLocaleTimeString("nl-BE", { hour: "2-digit", minute: "2-digit" })}` : "";
  return day + time;
}

function Facturen() {
  const qc = useQueryClient();
  const create = useServerFn(createInvoices);
  const createSub = useServerFn(createSubcontractInvoices);
  const send = useServerFn(sendInvoices);
  const getPdf = useServerFn(invoicePdf);
  const creditNote = useServerFn(createCreditNote);
  const mailWerkbon = useServerFn(sendWerkbonEmail);
  const byPost = useServerFn(sendInvoiceByPost);
  const copyMail = useServerFn(sendInvoiceCopy);
  async function sendCopy(id: string, number: string, currentEmail: string | null) {
    const to = window.prompt(`Kopie van factuur ${number} mailen naar:`, currentEmail ?? "");
    if (!to?.trim()) return;
    setBusy(true);
    try { await copyMail({ data: { invoiceId: id, to: to.trim() } }); toast.success(`Kopie verzonden naar ${to.trim()}`); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Kopie verzenden mislukt'); }
    finally { setBusy(false); }
  }
  async function sendPost(id: string, number: string) {
    if (!confirm(`Factuur ${number} per briefpost (bpost) versturen naar het adres van de klant?`)) return;
    setBusy(true);
    try { await byPost({ data: { invoiceId: id } }); toast.success('Factuur per post verstuurd'); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Briefpost mislukt'); }
    finally { setBusy(false); }
  }
  const WB_REASON: Record<string, string> = { not_signed: 'Werkbon is nog niet afgerond', no_email: 'Geen e-mailadres op de werkbon', mailbox_not_connected: 'Mailbox info@riory.be is niet gekoppeld', reconnect_required: 'Mailbox info@riory.be opnieuw koppelen', send_failed: 'Verzenden mislukt' };
  async function sendWerkbon(id: string) {
    if (!confirm('Werkbon naar de klant mailen?')) return;
    setBusy(true);
    try { const r = await mailWerkbon({ data: { workOrderId: id } }); r.sent ? toast.success('Werkbon verzonden') : toast.error(WB_REASON[r.reason]); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Verzenden mislukt'); }
    finally { setBusy(false); }
  }
  const [selWo, setSelWo] = useState<string[]>([]);
  const [selInv, setSelInv] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["facturen"],
    refetchInterval: 10_000,
    queryFn: async () => {
      const [w, i, s, a, o] = await Promise.all([
        supabase.from("work_orders").select("id, number, customer_name, signed_at, paid_amount, paid_at, vat_number, scheduled_date, scheduled_from, scheduled_until, activity_id, distance_km, vat_rate, warranty, no_invoice, subcontract_auto, time_entries(started_at, ended_at), materials(quantity, unit_price), technicians!work_orders_technician_id_fkey(name)").eq("status", "afgetekend").is("contract_id", null).order("signed_at", { ascending: false }),
        supabase.from("invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("settings").select("*").eq("id", 1).single(),
        supabase.from("activities").select("id, hourly_rate"),
        supabase.from("document_deliveries").select("document_id, document_open_events(opened_at)").in("document_type", ["factuur", "creditnota", "herinnering"]).not("sent_at", "is", null).order("created_at", { ascending: false }).limit(1000),
      ]);
      const opens: Record<string, { first: string; last: string; count: number }> = {};
      for (const d of (o.data ?? []) as { document_id: string; document_open_events: { opened_at: string }[] }[]) {
        for (const e of d.document_open_events ?? []) {
          const cur = opens[d.document_id] ?? { first: e.opened_at, last: e.opened_at, count: 0 };
          cur.count++; if (e.opened_at < cur.first) cur.first = e.opened_at; if (e.opened_at > cur.last) cur.last = e.opened_at;
          opens[d.document_id] = cur;
        }
      }
      const invoiced = new Set((i.data ?? []).flatMap((x) => [x.work_order_id, ...((x as { extra_work_order_ids?: string[] }).extra_work_order_ids ?? [])]));
      const uninvoiced = (w.data ?? []).filter((x) => !invoiced.has(x.id)) as unknown as TodoRow[];
      return { todo: uninvoiced.filter((x) => !x.no_invoice && !x.subcontract_auto), sub: uninvoiced.filter((x) => !x.no_invoice && x.subcontract_auto), noInvoice: uninvoiced.filter((x) => x.no_invoice), invoices: i.data ?? [], settings: s.data, activities: a.data ?? [], opens };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["facturen"] });
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function convert() {
    setBusy(true);
    try {
      const r = await create({ data: { workOrderIds: selWo } });
      toast.success(`${r.created.length} factuur/facturen gemaakt${r.sent ? `, ${r.sent} betaalde automatisch verzonden` : ""}${r.failed ? `, ${r.failed} verzending mislukt` : ""}`);
      setSelWo([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Omzetten mislukt"); }
    setBusy(false);
    refresh();
  }
  async function invoiceSub(ids: string[]) {
    if (!confirm(`${ids.length} factuur/facturen maken volgens de goedgekeurde offerte? Ze worden nog niet verzonden.`)) return;
    setBusy(true);
    try {
      const r = await createSub({ data: { workOrderIds: ids } });
      if (r.created.length) toast.success(`${r.created.length} factuur/facturen gemaakt volgens offerte`);
      if (r.problems.length) toast.error(r.problems.join(" · "));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Factureren mislukt"); }
    setBusy(false);
    refresh();
  }
  async function removeSelected() {
    setBusy(true);
    try {
      const ids = selWo.filter((id) => data?.todo.some((w) => w.id === id));
      if (await deleteSelectedWorkOrders(qc, ids)) setSelWo([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Verwijderen mislukt"); }
    finally { setBusy(false); }
  }
  async function labelNoInvoice(ids: string[], value: boolean) {
    setBusy(true);
    try {
      const { error } = await supabase.from("work_orders").update({ no_invoice: value }).in("id", ids);
      if (error) throw error;
      toast.success(value ? `${ids.length} werkbon(nen) gelabeld als niet factureren` : `${ids.length} werkbon(nen) weer factureerbaar`);
      setSelWo([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Labelen mislukt"); }
    finally { setBusy(false); }
    refresh();
  }
  async function sendSel(ids: string[]) {
    if (!confirm(sendConfirmText(ids.length, Boolean(data?.settings?.peppol_active)))) return;
    setBusy(true);
    try {
      const r = await send({ data: { invoiceIds: ids } });
      const bad = r.filter((x) => !x.ok);
      if (bad.length) toast.error(`${bad.length} mislukt: ${bad.map((b) => ("error" in b ? b.error : "")).join(" · ")}`);
      if (r.length - bad.length) toast.success(`${r.length - bad.length} verzonden`);
      setSelInv([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Verzenden mislukt"); }
    setBusy(false);
    refresh();
  }
  async function makeCreditNote(id: string) {
    if (!confirm("Creditnota aanmaken die deze factuur volledig terugdraait?")) return;
    setBusy(true);
    try {
      await creditNote({ data: { invoiceId: id } });
      toast.success("Creditnota aangemaakt. Maak de gecorrigeerde factuur via “Nieuwe factuur i.p.v. …” bij de creditnota.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Creditnota mislukt"); }
    setBusy(false);
    refresh();
  }
  async function download(id: string) {
    const r = await getPdf({ data: { invoiceId: id } });
    const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url; a.download = `Factuur-${r.number}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }
  const kmRate = Number(data?.settings?.km_rate ?? 0);
  const hourlyRateOf = (id: string | null) => Number(data?.activities.find((a) => a.id === id)?.hourly_rate ?? 0);
  /** Prijs van een nog te factureren bon: het betaalde bedrag, anders het berekende totaal. */
  const todoAmount = (w: TodoRow) =>
    workOrderRevenue({
      paidAmount: w.paid_amount == null ? null : Number(w.paid_amount),
      seconds: totalSeconds(w.time_entries, Date.now()),
      hourlyRate: hourlyRateOf(w.activity_id),
      distanceKm: w.distance_km == null ? null : Number(w.distance_km),
      kmRate,
      materials: w.materials.map((m) => ({ quantity: Number(m.quantity), unit_price: Number(m.unit_price) })),
      vatRate: Number(w.vat_rate),
      warranty: w.warranty,
    });
  const todoSort = useSort(data?.todo ?? [], { nr: (w) => w.number, klant: (w) => w.customer_name, ploeg: (w) => w.technicians?.name, datum: (w) => w.scheduled_date ?? w.signed_at, betaald: (w) => todoAmount(w) });
  const invSort = useSort(data?.invoices ?? [], { nr: (i) => i.number, klant: (i) => (i.customer as { name?: string }).name, datum: (i) => i.created_at, bedrag: (i) => Number(i.total), status: (i) => i.status });
  const [openInv, setOpenInv] = useState<string | null>(null);
  const [showNoInvoice, setShowNoInvoice] = useState(false);
  if (!data) return <p className="text-muted-foreground">Laden…</p>;
  const s = data.settings;
  const openIds = data.invoices.filter((i) => i.status !== "verzonden").map((i) => i.id);
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD, lokale tijd

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-black uppercase">Facturen</h1>
      <div className="space-y-2">
        <h2 className="text-sm font-bold">Afzender facturen en creditnota’s: boekhouding@riory.be</h2>
        <InvoiceMailboxConnect />
      </div>

      <section className="space-y-3 rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-black uppercase">Te factureren</h2>
          <span className="text-sm text-muted-foreground">({data.todo.length} afgetekende werkbonnen)</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setSelWo(selWo.length === data.todo.length ? [] : data.todo.map((w) => w.id))}>
              {selWo.length === data.todo.length && selWo.length ? "Niets selecteren" : "Alles selecteren"}
            </Button>
            <Button variant="destructive" size="sm" disabled={!selWo.length || busy} onClick={removeSelected}><Trash2 className="h-4 w-4" />Geselecteerde verwijderen ({selWo.length})</Button>
            <Button variant="outline" size="sm" disabled={!selWo.length || busy} onClick={() => labelNoInvoice(selWo, true)}>Niet factureren ({selWo.length})</Button>
            <Button size="sm" disabled={!selWo.length || busy} onClick={convert}>Omzetten naar factuur ({selWo.length})</Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Afgerekende bonnen worden meteen verzonden; openstaande facturen verzend je hieronder zelf.</p>
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead><tr>
              <Th className="w-8" />
              <SortTh k="nr" sort={todoSort}>Nr.</SortTh>
              <SortTh k="klant" sort={todoSort}>Klant</SortTh>
              <SortTh k="ploeg" sort={todoSort} className="hidden sm:table-cell">Ploeg</SortTh>
              <SortTh k="datum" sort={todoSort} className="hidden sm:table-cell">Datum</SortTh>
              <SortTh k="betaald" sort={todoSort} right>Betaald</SortTh>
            </tr></thead>
            <tbody>
              {todoSort.sorted.map((w) => (
                <tr key={w.id} className={rowTint[workOrderRowState(w)]}>
                  <td><input type="checkbox" aria-label={`Selecteer werkbon ${werkbonNr(w.number)}`} disabled={busy} className="h-5 w-5 accent-primary" checked={selWo.includes(w.id)} onChange={() => toggle(selWo, setSelWo, w.id)} /></td>
                  <td><Link to="/werkbonnen/$id" params={{ id: w.id }} className="font-mono font-bold underline">{werkbonNr(w.number)}</Link></td>
                  <td>{w.customer_name}{w.vat_number && <div className="font-mono text-xs text-muted-foreground">{w.vat_number}</div>}<div className="text-xs text-muted-foreground sm:hidden">{w.technicians?.name ?? "Geen ploeg"} · {woWhen(w)}</div></td>
                  <td className="hidden sm:table-cell">{w.technicians?.name ?? <span className="text-muted-foreground">Geen ploeg</span>}</td>
                  <td className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{woWhen(w)}</td>
                  <td className="whitespace-nowrap text-right font-mono">{euro(todoAmount(w))}</td>
                </tr>
              ))}
              {!data.todo.length && <tr><td colSpan={6} className="text-muted-foreground">Alles is gefactureerd.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {data.sub.length > 0 && (
        <section className="space-y-3 rounded-md border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black uppercase">Onderaannemers – factureren volgens offerte</h2>
            <span className="text-sm text-muted-foreground">({data.sub.length})</span>
            <Button size="sm" className="ml-auto" disabled={busy} onClick={() => invoiceSub(data.sub.map((w) => w.id))}>Alles factureren volgens offerte</Button>
          </div>
          <p className="text-sm text-muted-foreground">Opdrachten van onderaannemers zonder login worden op het einde van de opdrachtdag automatisch afgesloten. Factureer zodra de aankoopfactuur van de onderaannemer binnen is.</p>
          <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr><Th>Nr.</Th><Th>Klant</Th><Th className="hidden sm:table-cell">Onderaannemer</Th><Th className="hidden sm:table-cell">Datum</Th><Th /></tr></thead>
              <tbody>
                {data.sub.map((w) => (
                  <tr key={w.id}>
                    <td><Link to="/werkbonnen/$id" params={{ id: w.id }} className="font-mono font-bold underline">{werkbonNr(w.number)}</Link></td>
                    <td>{w.customer_name}</td>
                    <td className="hidden sm:table-cell">{w.technicians?.name ?? "—"}</td>
                    <td className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{woWhen(w)}</td>
                    <td className="text-right"><Button size="sm" disabled={busy} onClick={() => invoiceSub([w.id])}>Factureren volgens offerte</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(data.noInvoice?.length ?? 0) > 0 && (
        <section className="space-y-3 rounded-md border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black uppercase">Niet te factureren</h2>
            <span className="text-sm text-muted-foreground">({data.noInvoice.length} werkbonnen, bijv. garantie)</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setShowNoInvoice(!showNoInvoice)}>{showNoInvoice ? "Inklappen" : "Uitklappen"}</Button>
          </div>
          {showNoInvoice && <div className="overflow-x-auto">
            <table className={tableCls}>
              <thead><tr><Th>Nr.</Th><Th>Klant</Th><Th className="hidden sm:table-cell">Datum</Th><Th /></tr></thead>
              <tbody>
                {data.noInvoice.map((w) => (
                  <tr key={w.id}>
                    <td><Link to="/werkbonnen/$id" params={{ id: w.id }} className="font-mono font-bold underline">{werkbonNr(w.number)}</Link></td>
                    <td>{w.customer_name}</td>
                    <td className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">{woWhen(w)}</td>
                    <td className="text-right"><Button variant="outline" size="sm" disabled={busy} onClick={() => labelNoInvoice([w.id], false)}>Toch factureren</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </section>
      )}

      <section className="space-y-3 rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-black uppercase">Facturen</h2>
          <div className="ml-auto flex flex-wrap gap-2">
            <NewInvoice onCreated={refresh} />
            <NewInvoice onCreated={refresh} creditNote />
            <Button variant="outline" size="sm" onClick={() => setSelInv(selInv.length ? [] : openIds)}>{selInv.length ? "Niets selecteren" : "Alle openstaande"}</Button>
            <Button size="sm" disabled={!selInv.length || busy} onClick={() => sendSel(selInv)}>Verzenden ({selInv.length})</Button>
            <AccountantPackage accountantEmail={s?.accountant_email ?? null} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className={tableCls}>
            <thead><tr>
              <Th className="w-8" />
              <SortTh k="nr" sort={invSort}>Nr.</SortTh>
              <SortTh k="klant" sort={invSort}>Klant</SortTh>
              <SortTh k="datum" sort={invSort} className="hidden md:table-cell">Datum</SortTh>
              <SortTh k="bedrag" sort={invSort} right>Bedrag</SortTh>
              <SortTh k="status" sort={invSort}>Status</SortTh>
              <Th right>Acties</Th>
            </tr></thead>
            <tbody>
              {invSort.sorted.map((i) => {
                const open = Number(i.total) - Number(i.paid_amount) > 0.005;
                const state = invoiceRowState(i, today);
                const paid = state === "paid";
                const expanded = openInv === i.id;
                return (
                  <Fragment key={i.id}>
                     <tr className={rowTint[state]}>
                      <td><input type="checkbox" aria-label={`Selecteer factuur ${i.number}`} disabled={i.status === "verzonden"} className="h-5 w-5 accent-primary" checked={selInv.includes(i.id)} onChange={() => toggle(selInv, setSelInv, i.id)} /></td>
                      <td className="whitespace-nowrap font-mono font-bold"><span className="inline-flex items-center gap-1.5">{i.number}{i.pdf_sent_at && <OpenEye info={data.opens?.[i.id]} />}</span>{i.kind === "creditnota" && <div className="w-fit rounded bg-destructive px-1.5 py-0.5 font-sans text-[10px] font-bold text-destructive-foreground">Creditnota</div>}</td>
                      <td>{(i.customer as { name?: string }).name}{i.contract_reference && <div className="max-w-xs truncate text-xs text-muted-foreground" title={i.contract_reference}>{i.contract_reference}</div>}</td>
                      <td className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{new Date(i.created_at).toLocaleDateString("nl-BE")}</td>
                      <td className={`whitespace-nowrap text-right font-mono ${i.kind === "creditnota" ? "font-bold text-destructive" : ""}`}>
                        {euro(i.kind === "creditnota" ? -Math.abs(Number(i.total)) : Number(i.total))}
                        {i.kind !== "creditnota" && Number(i.paid_amount) > 0.005 && open && (
                          <div className="text-xs font-normal text-muted-foreground">Betaald {euro(Number(i.paid_amount))} · Open {euro(Number(i.total) - Number(i.paid_amount))}</div>
                        )}
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1">
                          <span className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-bold ${i.status === "verzonden" ? "bg-accent text-accent-foreground" : i.status === "fout" ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}>{STATUS[i.status] ?? i.status}</span>
                          {paid && <span className="whitespace-nowrap rounded bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">{i.kind === "creditnota" ? "Verrekend" : "Betaald"}</span>}
                          {state === "overdue" && <span className="whitespace-nowrap rounded bg-overdue-foreground px-2 py-0.5 text-xs font-bold text-background">Vervallen</span>}
                        </div>
                        {i.send_error && <div className="max-w-xs truncate text-xs text-destructive" title={i.send_error}>{i.send_error}</div>}
                      </td>
                      <td className="whitespace-nowrap text-right">
                        <div className="inline-flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => download(i.id)}>PDF</Button>
                          {i.status !== "verzonden" && <Button size="sm" disabled={busy} onClick={() => sendSel([i.id])}>Verzenden</Button>}
                          {i.status !== "verzonden" && !i.pdf_sent_at && !i.okioki_sent_at && !i.post_sent_at && (
                            <Button variant="destructive" size="sm" disabled={busy} aria-label={`Factuur ${i.number} verwijderen`} onClick={async () => {
                              if (!window.confirm(`${i.kind === "creditnota" ? "Creditnota" : "Factuur"} ${i.number} definitief verwijderen? Dit nummer wordt niet hergebruikt.`)) return;
                              const { error } = await supabase.rpc("delete_unsent_invoice", { _invoice_id: i.id });
                              if (error) toast.error(error.message); else { toast.success("Verwijderd"); setSelInv((s) => s.filter((x) => x !== i.id)); qc.invalidateQueries(); }
                            }}><Trash2 className="h-4 w-4" /></Button>
                          )}
                          <Button variant="ghost" size="sm" aria-expanded={expanded} onClick={() => setOpenInv(expanded ? null : i.id)}>{expanded ? "Minder" : "Meer"}</Button>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-muted/30"><td colSpan={7}>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {i.kind !== "creditnota" && <span>Mededeling: <span className="font-mono">{invoicePaymentReference(i.number)}</span></span>}
                            {i.sent_via && <span>Via {i.sent_via === "okioki" ? "PDF + OkiOki" : i.sent_via === "peppol" ? "Peppol" : "e-mail"}</span>}
                            {i.pdf_sent_at && <span>PDF gemaild</span>}
                            {i.okioki_sent_at && <span>UBL naar OkiOki gemaild</span>}
                            {i.pdf_sent_at && (data.opens?.[i.id]
                              ? <span className="rounded bg-primary/15 px-1.5 font-semibold text-foreground">Geopend {new Date(data.opens[i.id]!.last).toLocaleString("nl-BE", { dateStyle: "short", timeStyle: "short" })}{data.opens[i.id]!.count > 1 ? ` · ${data.opens[i.id]!.count}×` : ""}</span>
                              : <span className="rounded bg-muted px-1.5">Nog niet geopend</span>)}
                            {paid && i.paid_at && <span>Betaald op {new Date(i.paid_at).toLocaleDateString("nl-BE")}</span>}
                            {i.post_sent_at && <span>Per post verstuurd {new Date(i.post_sent_at).toLocaleDateString("nl-BE")}</span>}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <DocumentReport id={i.id} type={i.kind === 'creditnota' ? 'creditnota' : 'factuur'} />
                            {i.work_order_id && <WorkOrderPreview workOrderId={i.work_order_id} size="sm" />}
                            {i.work_order_id && <Button variant="outline" size="sm" disabled={busy} onClick={() => sendWerkbon(i.work_order_id!)}>Werkbon verzenden</Button>}
                            {i.kind !== "creditnota" && <Button variant="outline" size="sm" disabled={busy} onClick={() => makeCreditNote(i.id)}>Creditnota</Button>}
                            {i.kind === "creditnota" && <CreditNoteSettle credit={i} invoices={data.invoices} onDone={refresh} />}
                            {i.kind !== "creditnota" && open && <PaymentReminders invoiceId={i.id} />}
                            {i.kind !== "creditnota" && open && <InvoicePaymentDetails invoice={i} company={{ name: s?.company_name ?? "Riory bv", iban: s?.company_iban ?? null, bic: s?.company_bic ?? null }} />}
                            {i.kind !== "creditnota" && <NewInvoice copyFrom={i} copyLabel={data.invoices.some((c) => c.credit_for === i.id) ? "Nieuwe factuur (gecorrigeerd)" : "Kopie als nieuwe factuur"} onCreated={refresh} />}
                            {i.kind === "creditnota" && i.credit_for && (() => { const o = data.invoices.find((x) => x.id === i.credit_for); return o ? <NewInvoice copyFrom={o} copyLabel={`Nieuwe factuur i.p.v. ${o.number}`} onCreated={refresh} /> : null; })()}
                            {isInvoiceEditable(i) && <NewInvoice invoice={i} creditNote={i.kind === "creditnota"} onCreated={refresh} />}
                            {i.kind !== "creditnota" && !i.post_sent_at && <Button variant="outline" size="sm" disabled={busy} onClick={() => sendPost(i.id, i.number)}>Per post</Button>}
                            {i.status === "verzonden" && <Button variant="outline" size="sm" disabled={busy} onClick={() => sendCopy(i.id, i.number, (i.customer as { email?: string | null } | null)?.email ?? null)}>Kopie mailen</Button>}
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
              {!data.invoices.length && <tr><td colSpan={7} className="text-muted-foreground">Nog geen facturen.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Link to="/boekhouding" search={{ tab: "bank" }}><Button variant="outline">Bankbetalingen afpunten</Button></Link>
    </div>
  );
}
