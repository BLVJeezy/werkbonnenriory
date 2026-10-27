import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { euro } from "@/lib/billing";
import { createCreditNote, createInvoices, invoicePdf, sendAllToAccountant, sendInvoices } from "@/lib/invoices.functions";
import { Trash2 } from "lucide-react";
import { deleteSelectedWorkOrders } from "@/lib/delete-task";

export const Route = createFileRoute("/_authenticated/facturen")({
  head: () => ({ meta: [{ title: "Facturen — Riory Werkbonnen" }, { name: "description", content: "Riory-facturen als PDF naar klanten en als UBL naar OkiOki." }, { property: "og:title", content: "Facturen — Riory Werkbonnen" }, { property: "og:description", content: "Riory-facturen als PDF naar klanten en als UBL naar OkiOki." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Facturen,
});

const STATUS: Record<string, string> = { concept: "Te verzenden", verzonden: "Verzonden", fout: "Mislukt" };

function Facturen() {
  const qc = useQueryClient();
  const create = useServerFn(createInvoices);
  const send = useServerFn(sendInvoices);
  const getPdf = useServerFn(invoicePdf);
  const creditNote = useServerFn(createCreditNote);
  const toAccountant = useServerFn(sendAllToAccountant);
  const [selWo, setSelWo] = useState<string[]>([]);
  const [selInv, setSelInv] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const { data } = useQuery({
    queryKey: ["facturen"],
    queryFn: async () => {
      const [w, i, s] = await Promise.all([
        supabase.from("work_orders").select("id, number, customer_name, signed_at, paid_amount, paid_at, vat_number").eq("status", "afgetekend").order("signed_at", { ascending: false }),
        supabase.from("invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("settings").select("*").eq("id", 1).single(),
      ]);
      const invoiced = new Set((i.data ?? []).map((x) => x.work_order_id));
      return { todo: (w.data ?? []).filter((x) => !invoiced.has(x.id)), invoices: i.data ?? [], settings: s.data };
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
  async function removeSelected() {
    setBusy(true);
    try {
      const ids = selWo.filter((id) => data?.todo.some((w) => w.id === id));
      if (await deleteSelectedWorkOrders(qc, ids)) setSelWo([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Verwijderen mislukt"); }
    finally { setBusy(false); }
  }
  async function sendSel(ids: string[]) {
    if (!confirm(`${ids.length} factuur/facturen nu verzenden? De klant krijgt de PDF; bij een ingevuld btw-nummer gaat een aparte UBL-mail naar BE0840931404701144@okioki.app.`)) return;
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
      toast.success("Creditnota aangemaakt");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Creditnota mislukt"); }
    setBusy(false);
    refresh();
  }
  async function sendToAccountant() {
    if (!confirm(`Alle facturen en creditnota's als UBL in één mail naar ${s?.accountant_email ?? "de boekhouder"} sturen?`)) return;
    setBusy(true);
    try {
      const r = await toAccountant();
      toast.success(`${r.sent} UBL-bestanden gemaild naar ${r.to}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Verzenden mislukt"); }
    setBusy(false);
  }
  async function download(id: string) {
    const r = await getPdf({ data: { invoiceId: id } });
    const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url; a.download = `Factuur-${r.number}.pdf`; a.click();
    URL.revokeObjectURL(url);
  }
  async function saveSetting(patch: Database["public"]["Tables"]["settings"]["Update"]) {
    const { error } = await supabase.from("settings").update(patch).eq("id", 1);
    if (error) toast.error(error.message); else toast.success("Opgeslagen");
    refresh();
  }

  if (!data) return <p className="text-muted-foreground">Laden…</p>;
  const s = data.settings;
  const openIds = data.invoices.filter((i) => i.status !== "verzonden").map((i) => i.id);

  return (
    <div className="space-y-8">
      <h1 className="text-3xl font-black uppercase">Facturen</h1>

      <section className="space-y-3 rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-black uppercase">Te factureren</h2>
          <span className="text-sm text-muted-foreground">({data.todo.length} afgetekende werkbonnen)</span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setSelWo(selWo.length === data.todo.length ? [] : data.todo.map((w) => w.id))}>
              {selWo.length === data.todo.length && selWo.length ? "Niets selecteren" : "Alles selecteren"}
            </Button>
            <Button variant="destructive" size="sm" disabled={!selWo.length || busy} onClick={removeSelected}><Trash2 className="h-4 w-4" />Geselecteerde verwijderen ({selWo.length})</Button>
            <Button size="sm" disabled={!selWo.length || busy} onClick={convert}>Omzetten naar factuur ({selWo.length})</Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Afgerekende bonnen worden meteen verzonden; openstaande facturen verzend je hieronder zelf.</p>
        <ul className="divide-y">
          {data.todo.map((w) => (
            <li key={w.id} className="flex items-center gap-3 py-2">
              <input type="checkbox" aria-label={`Selecteer werkbon #${w.number}`} disabled={busy} className="h-5 w-5 accent-primary" checked={selWo.includes(w.id)} onChange={() => toggle(selWo, setSelWo, w.id)} />
              <Link to="/werkbonnen/$id" params={{ id: w.id }} className="font-mono font-bold underline">#{w.number}</Link>
              <span className="flex-1">{w.customer_name}</span>
              {w.vat_number && <span className="text-xs text-muted-foreground">{w.vat_number}</span>}
              <span className="text-sm">{w.paid_at ? `Betaald ${euro(Number(w.paid_amount))}` : "Open"}</span>
            </li>
          ))}
          {!data.todo.length && <li className="py-2 text-muted-foreground">Alles is gefactureerd.</li>}
        </ul>
      </section>

      <section className="space-y-3 rounded-md border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-black uppercase">Facturen</h2>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setSelInv(selInv.length ? [] : openIds)}>{selInv.length ? "Niets selecteren" : "Alle openstaande"}</Button>
            <Button size="sm" disabled={!selInv.length || busy} onClick={() => sendSel(selInv)}>Verzenden ({selInv.length})</Button>
            <Button variant="outline" size="sm" disabled={busy || !data.invoices.length} onClick={sendToAccountant}>Alles naar boekhouder (UBL)</Button>
          </div>
        </div>
        <ul className="divide-y">
          {data.invoices.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 py-2">
              <input type="checkbox" disabled={i.status === "verzonden"} className="h-5 w-5 accent-primary" checked={selInv.includes(i.id)} onChange={() => toggle(selInv, setSelInv, i.id)} />
              <span className="font-mono font-bold">{i.number}</span>
              {i.kind === "creditnota" && <span className="rounded bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">Creditnota</span>}
              <span className="flex-1">{(i.customer as { name?: string }).name}</span>
              <span className="font-mono">{euro(Number(i.total))}</span>
              <span className={`rounded px-2 py-0.5 text-xs font-bold ${i.status === "verzonden" ? "bg-accent text-accent-foreground" : i.status === "fout" ? "bg-destructive text-destructive-foreground" : "bg-muted"}`}>
                {STATUS[i.status] ?? i.status}{i.sent_via ? ` · ${i.sent_via === "okioki" ? "PDF + OkiOki" : i.sent_via === "peppol" ? "Peppol" : "e-mail"}` : ""}
              </span>
              {i.pdf_sent_at && <span className="text-xs text-muted-foreground">PDF gemaild</span>}
              {i.okioki_sent_at && <span className="text-xs text-muted-foreground">UBL naar OkiOki gemaild</span>}
              <Button variant="outline" size="sm" onClick={() => download(i.id)}>PDF</Button>
              {i.kind !== "creditnota" && <Button variant="outline" size="sm" disabled={busy} onClick={() => makeCreditNote(i.id)}>Creditnota</Button>}
              {i.status !== "verzonden" && <Button size="sm" disabled={busy} onClick={() => sendSel([i.id])}>Verzenden</Button>}
              {i.send_error && <p className="w-full text-xs text-destructive">{i.send_error}</p>}
            </li>
          ))}
          {!data.invoices.length && <li className="py-2 text-muted-foreground">Nog geen facturen.</li>}
        </ul>
      </section>

      {s && (
        <section className="grid gap-3 rounded-md border bg-card p-4 sm:grid-cols-2">
          <h2 className="text-lg font-black uppercase sm:col-span-2">Factuurinstellingen</h2>
          <div className="space-y-1"><Label>Volgend factuurnummer (aansluitend op Simpla)</Label>
            <Input type="number" defaultValue={s.next_invoice_number} onBlur={(e) => Number(e.target.value) !== s.next_invoice_number && saveSetting({ next_invoice_number: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label>Voorvoegsel (bv. 2026-)</Label>
            <Input defaultValue={s.invoice_prefix} onBlur={(e) => e.target.value !== s.invoice_prefix && saveSetting({ invoice_prefix: e.target.value })} /></div>
          <div className="space-y-1"><Label>Betalingstermijn (dagen)</Label>
            <Input type="number" defaultValue={s.payment_days} onBlur={(e) => Number(e.target.value) !== s.payment_days && saveSetting({ payment_days: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label>Btw-nummer Riory</Label>
            <Input defaultValue={s.company_vat} onBlur={(e) => e.target.value !== s.company_vat && saveSetting({ company_vat: e.target.value })} /></div>
          <div className="space-y-1"><Label>IBAN</Label>
            <Input defaultValue={s.company_iban ?? ""} onBlur={(e) => e.target.value !== (s.company_iban ?? "") && saveSetting({ company_iban: e.target.value || null })} /></div>
          <div className="space-y-1"><Label>BIC</Label>
            <Input defaultValue={s.company_bic ?? ""} onBlur={(e) => e.target.value !== (s.company_bic ?? "") && saveSetting({ company_bic: e.target.value || null })} /></div>
          <div className="space-y-1"><Label>E-mail boekhouder (voor UBL-verzending)</Label>
            <Input type="email" defaultValue={s.accountant_email} onBlur={(e) => e.target.value !== s.accountant_email && saveSetting({ accountant_email: e.target.value })} /></div>
          <div className="space-y-1 sm:col-span-2"><Label>Algemene voorwaarden (komen achteraan op elke factuur)</Label>
            <Textarea rows={10} defaultValue={s.terms_text ?? ""} onBlur={(e) => e.target.value !== (s.terms_text ?? "") && saveSetting({ terms_text: e.target.value || null })} /></div>
        </section>
      )}
    </div>
  );
}
