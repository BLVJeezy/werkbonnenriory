import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from '@/components/ui/checkbox';
import { ReceiptScanner } from '@/components/ReceiptScanner';
import { PAYMENT_METHODS, deductibleVat, supplierVatWarning } from '@/lib/supplier-rules';
import { Link } from '@tanstack/react-router';
import { canExportPurchase } from '@/lib/purchase-payment';
import { euro } from "@/lib/billing";
import { purchaseInvoiceWarnings, type PurchaseLine } from "@/lib/purchase-invoice";
import { bookPurchaseInvoice, importFromPeppyrus, listExpenseAccounts, peppyrusStatus, suggestPurchaseAccounts } from "@/lib/purchase-booking.functions";
import { daysUntilDue, dueLabel, paymentCommunication, paymentMethodLock, supplierBankWarnings } from "@/lib/purchase-booking";
import { attachPurchasePdf, importReceipt, importPurchaseInvoices, importPurchasesFromSimpla, paymentFile, setPurchaseInvoiceStatus, updatePurchaseInvoice } from "@/lib/purchase-invoices.functions";

export const Route = createFileRoute("/_authenticated/aankoopfacturen")({
  head: () => ({ meta: [{ title: "Aankoopfacturen — Riory Werkbonnen" }, { name: "description", content: "Inkomende facturen inlezen, controleren en in bulk betalen op de vervaldag." }, { property: "og:title", content: "Aankoopfacturen — Riory Werkbonnen" }, { property: "og:description", content: "Inkomende facturen inlezen, controleren en in bulk betalen op de vervaldag." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Aankoopfacturen,
});

type Row = {
  id: string; supplier_name: string; supplier_vat: string | null; supplier_iban: string | null;
  invoice_number: string | null; invoice_date: string | null; due_date: string | null;
  lines: PurchaseLine[]; net: number; vat: number; total: number; payment_ref: string | null;
  status: string; pdf_path: string | null; created_at: string; kind: 'factuur' | 'creditnota'; paid_at: string | null; bank_payment_ref: string | null;
  payment_method: string; supplier_vat_rule: string; vat_deductible_percent: number;
};

const STATUS: Record<string, string> = { te_controleren: "Te controleren", goedgekeurd: "Goedgekeurd", betaald: "Afgeletterd", betaling_klaargezet: 'Betaling klaargezet' };
const d = (s: string | null) => (s ? new Date(`${s}T12:00:00Z`).toLocaleDateString("nl-BE") : "—");

function Aankoopfacturen() {
  const qc = useQueryClient();
  const doImport = useServerFn(importPurchaseInvoices);
  const doSimpla = useServerFn(importPurchasesFromSimpla);
  const uploadPdf = useServerFn(attachPurchasePdf);
  const uploadTicket = useServerFn(importReceipt);
  const getPeppyrus = useServerFn(peppyrusStatus);
  const doPeppyrus = useServerFn(importFromPeppyrus);
  const getAccounts = useServerFn(listExpenseAccounts);
  const suggest = useServerFn(suggestPurchaseAccounts);
  const book = useServerFn(bookPurchaseInvoice);
  const { data: peppyrus } = useQuery({ queryKey: ['peppyrus'], queryFn: () => getPeppyrus() });
  const { data: accounts = [] } = useQuery({ queryKey: ['expense-accounts'], queryFn: () => getAccounts() });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: async () => (await supabase.from('suppliers').select('*').order('name')).data ?? [] });
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [tab, setTab] = useState<'te_controleren' | 'goedgekeurd' | 'betaald' | 'alle'>('te_controleren');
  const [drag, setDrag] = useState(false);
  const [sources, setSources] = useState<Record<number, string>>({});
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Brussels' });
  async function vanPeppyrus() {
    setBusy(true);
    try { const r = await doPeppyrus(); toast.success(`${r.imported} Peppol-factuur/facturen ontvangen${r.skipped ? `, ${r.skipped} al aanwezig` : ''}`); r.errors.forEach(e => toast.error(e)); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Peppyrus ophalen mislukt'); }
    setBusy(false); refresh();
  }
  async function stelVoor(row: Row) {
    try {
      const r = await suggest({ data: { supplierId: (row as Row & { supplier_id?: string | null }).supplier_id ?? null, supplierName: row.supplier_name, lines: row.lines } });
      setEdit(e => e && e.id === row.id ? { ...e, lines: e.lines.map((l, i) => l.account ? l : { ...l, account: r[i]?.account ?? null }) } : e);
      setSources(Object.fromEntries(r.map((x, i) => [i, x.source ?? ''])));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Rekeningvoorstel mislukt'); }
  }
  async function boek() {
    if (!edit) return;
    setBusy(true);
    try { await slaOp(false, true); await book({ data: { id: edit.id, lines: edit.lines } }); toast.success('Lijnen geboekt — keuzes onthouden voor volgende facturen'); setEdit(null); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Boeken mislukt'); }
    setBusy(false); refresh();
  }
  async function leesBestanden(files: FileList | File[]) { for (const f of Array.from(files)) await leesTicket(f); }
  async function vanSimpla() {
    setBusy(true);
    try { const r = await doSimpla(); toast.success(`${r.imported} openstaande factuur/facturen uit Simpla ingelezen${r.skipped ? `, ${r.skipped} al aanwezig` : ""}`); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Simpla inlezen mislukt"); }
    setBusy(false); refresh();
  }
  const update = useServerFn(updatePurchaseInvoice);
  const setStatus = useServerFn(setPurchaseInvoiceStatus);
  const payFile = useServerFn(paymentFile);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [edit, setEdit] = useState<Row | null>(null);

  async function leesTicket(file: File | undefined) {
    if (!file) return false;
    if (file.size > 10000000) { toast.error('Maximaal 10 MB per document'); return false; }
    setBusy(true);
    try {
      const base64 = await new Promise<string>((resolve,reject)=> { const reader = new FileReader(); reader.onload=()=>resolve(String(reader.result).split(',')[1]??''); reader.onerror=reject; reader.readAsDataURL(file); });
      const r = await uploadTicket({ data: {base64,mime:file.type,filename:file.name} });
      await refresh(); qc.invalidateQueries({queryKey:['suppliers']});
      const {data: row} = await supabase.from('purchase_invoices').select('*').eq('id',r.id).single();
      if (row) await openControle({...row, kind: row.kind === 'creditnota' ? 'creditnota' : 'factuur', lines: row.lines as PurchaseLine[]});
      toast.success(r.duplicate ? 'Dit document was al ingelezen' : 'Kasticket ingelezen — te controleren');
      return true;
    } catch(e) { toast.error(e instanceof Error ? e.message : 'Inlezen mislukt'); return false; }
    finally { setBusy(false); }
  }

  const { data: rows = [] } = useQuery({
    queryKey: ["purchase_invoices"],
    queryFn: async () => (await supabase.from("purchase_invoices").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["purchase_invoices"] });
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  async function importeer() {
    setBusy(true);
    try {
      const r = await doImport();
      toast.success(`${r.imported} factuur/facturen ingelezen${r.skipped ? `, ${r.skipped} overgeslagen` : ""}`);
      r.errors.forEach((e) => toast.error(e));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Inlezen mislukt"); }
    setBusy(false);
    refresh();
  }

  async function markeer(status: "te_controleren" | "goedgekeurd") {
    setBusy(true);
    try {
      await setStatus({ data: { ids: sel, status } });
      toast.success(status === "goedgekeurd" ? "Goedgekeurd" : "Terug naar te controleren");
      setSel([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Bijwerken mislukt"); }
    setBusy(false);
    refresh();
  }

  async function betaal() {
    const chosen = rows.filter((r) => sel.includes(r.id) && canExportPurchase({ ...r, total: Number(r.total) }));
    const locked = rows.filter((r) => sel.includes(r.id) && paymentMethodLock(r.payment_method, r.status));
    if (locked.length) toast.warning(`${locked.length} factuur/facturen overgeslagen: domiciliëring, kaart of cash wordt nooit manueel betaald`);
    if (!chosen.length) { toast.error("Selecteer goedgekeurde facturen met betaalwijze overschrijving"); return; }
    if (!confirm(`Betaalbestand maken voor ${chosen.length} facturen (${euro(chosen.reduce((s, r) => s + Number(r.total), 0))})? Elke factuur wordt op zijn vervaldag betaald. Laad het bestand daarna in je banktoepassing.`)) return;
    setBusy(true);
    try {
      const r = await payFile({ data: { ids: chosen.map((x) => x.id) } });
      const url = URL.createObjectURL(new Blob([r.xml], { type: "application/xml" }));
      const a = document.createElement("a");
      a.href = url; a.download = r.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success("Betaalbestand gedownload; wacht op bevestiging via bankbetaling");
      setSel([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Betaalbestand mislukt"); }
    setBusy(false);
    refresh();
  }

  async function bekijkPdf(path: string) {
    const tab = window.open('about:blank', '_blank');
    const { data, error } = await supabase.storage.from("aankoopfacturen").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { tab?.close(); toast.error("PDF openen mislukt"); return; }
    if (tab) tab.location.href = data.signedUrl;
    else setPdfUrl(data.signedUrl);
  }

  async function openControle(row: Row) {
    setEdit({ ...row, lines: (row.lines ?? []) as PurchaseLine[] }); setPdfUrl(null); setSources({});
    if (row.status !== 'betaald' && (row.lines ?? []).some((l) => !(l as PurchaseLine).account)) void stelVoor({ ...row, lines: (row.lines ?? []) as PurchaseLine[] });
    if (row.pdf_path) {
      const { data, error } = await supabase.storage.from('aankoopfacturen').createSignedUrl(row.pdf_path, 3600);
      if (error) toast.error('PDF laden mislukt');
      else setPdfUrl(data?.signedUrl ?? null);
    }
  }

  async function voegPdfToe(file: File | undefined, row: Row) {
    if (!file) return;
    if (file.size > 10000000) { toast.error('Kies een PDF van maximaal 10 MB'); return; }
    setBusy(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] ?? ''); reader.onerror = reject; reader.readAsDataURL(file); });
      const r = await uploadPdf({ data: { id: row.id, base64 } });
      await refresh(); await openControle({ ...row, pdf_path: r.path }); toast.success('Origineel PDF toegevoegd');
    } catch(e) { toast.error(e instanceof Error ? e.message : 'PDF toevoegen mislukt'); }
    setBusy(false);
  }

  async function slaOp(approve = false, silent = false) {
    if (!edit) return;
    if (!silent) setBusy(true);
    try {
      await update({
        data: {
          id: edit.id, kind: edit.kind, paymentMethod: edit.payment_method, supplierId: (edit as Row & { supplier_id?: string | null }).supplier_id ?? null, supplierName: edit.supplier_name, supplierVat: edit.supplier_vat, supplierIban: edit.supplier_iban,
          invoiceNumber: edit.invoice_number, invoiceDate: edit.invoice_date, dueDate: edit.due_date,
          lines: edit.lines, net: Number(edit.net), vat: Number(edit.vat), total: Number(edit.total), paymentRef: edit.payment_ref,
        },
      });
      if (approve) await setStatus({ data: { ids: [edit.id], status: 'goedgekeurd' } });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      if (silent) return;
      toast.success("Opgeslagen");
      setEdit(null);
    } catch (e) { if (silent) throw e; toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
    setBusy(false);
    refresh();
  }

  const warnings = edit ? purchaseInvoiceWarnings({
    supplierName: edit.supplier_name, supplierVat: edit.supplier_vat, supplierIban: edit.supplier_iban,
    invoiceNumber: edit.invoice_number, invoiceDate: edit.invoice_date, dueDate: edit.due_date,
    lines: edit.lines, net: Number(edit.net), vat: Number(edit.vat), total: Number(edit.total), paymentRef: edit.payment_ref,
  }) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-black uppercase">Aankoopfacturen</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link to="/leveranciers">Leveranciers</Link></Button>
          <Button variant="outline" disabled={busy} onClick={importeer}>{busy ? "Bezig…" : "Nu inlezen vanuit mail"}</Button>
          <Button variant="outline" disabled={busy} onClick={vanSimpla}>Inlezen uit Simpla</Button>
          {ponto?.connected ? <Button variant="outline" disabled={busy} onClick={controleerBetalingen}>Betalingen controleren</Button> : <Button variant="outline" asChild><Link to="/facturen">Ponto koppelen</Link></Button>}
          <Button variant="outline" disabled={!sel.length || busy} onClick={() => markeer("goedgekeurd")}>Goedkeuren ({sel.length})</Button>
          <Button disabled={!sel.length || busy} onClick={betaal}>Betaalbestand maken</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-y py-4"><ReceiptScanner disabled={busy} onScan={leesTicket}/><Label htmlFor="receipt-upload">Kasticket of aankoopdocument inlezen</Label><Input id="receipt-upload" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} className="max-w-sm" onChange={e=>{void leesTicket(e.target.files?.[0]);e.target.value='';}}/>{busy && <span role="status">Document wordt verwerkt…</span>}</div>
      {ponto?.lastSync && <p className="text-sm text-muted-foreground">Laatste betalingscontrole: {new Date(ponto.lastSync).toLocaleString('nl-BE')}</p>}

      <ul className="divide-y rounded-md border bg-card">
        {rows.length === 0 && <li className="p-4 text-muted-foreground">Nog geen aankoopfacturen.</li>}
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
            <input type="checkbox" aria-label={`Selecteer factuur ${r.invoice_number ?? r.supplier_name}`} className="h-5 w-5 accent-primary" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} />
            <span className="font-bold">{r.supplier_name}</span>
            <span className="font-mono text-sm">{r.invoice_number ?? "—"}</span>
            {r.kind === 'creditnota' && <span className="text-sm font-bold text-destructive">Creditnota</span>}
            <span className="text-sm text-muted-foreground">vervaldag {d(r.due_date)}</span>
            <span className="text-xs">{PAYMENT_METHODS[r.payment_method as keyof typeof PAYMENT_METHODS]}</span>
            <span className="ml-auto font-mono">{euro(r.kind === 'creditnota' ? -Math.abs(Number(r.total)) : Number(r.total))}</span>
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${r.status === "betaald" ? "bg-accent text-accent-foreground" : r.status === "goedgekeurd" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {STATUS[r.status] ?? r.status}
            </span>
            {r.paid_at && <span className="text-xs text-muted-foreground" title={r.bank_payment_ref ?? undefined}>Betaald op {new Date(r.paid_at).toLocaleDateString('nl-BE')}</span>}
            {r.pdf_path ? <Button variant="outline" size="sm" onClick={() => { if (r.pdf_path) void bekijkPdf(r.pdf_path); }}>Origineel</Button> : <span className="text-xs text-destructive">PDF ontbreekt</span>}
            <Button variant="outline" size="sm" onClick={() => openControle({ ...r, kind: r.kind === 'creditnota' ? 'creditnota' : 'factuur', lines: (r.lines ?? []) as PurchaseLine[] })}>{r.status === 'betaald' ? 'Bekijken' : 'Controleren'}</Button>
          </li>
        ))}
      </ul>

      {edit && (
        <section className="space-y-3 border-t pt-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black uppercase">Controleren: {edit.supplier_name}</h2>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setEdit(null)}>Sluiten</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Checkbox id="purchase-credit" checked={edit.kind === 'creditnota'} disabled={edit.status === 'betaald' || edit.status === 'betaling_klaargezet'} onCheckedChange={checked => setEdit({ ...edit, kind: checked === true ? 'creditnota' : 'factuur' })} />
            <Label htmlFor="purchase-credit">Dit is een creditnota</Label>
            <Label className="ml-auto" htmlFor="purchase-pdf">Origineel PDF toevoegen</Label>
            <Input id="purchase-pdf" aria-label="Origineel PDF toevoegen" className="max-w-72" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e => { void voegPdfToe(e.target.files?.[0], edit); e.target.value = ''; }} />
          </div>
          {pdfUrl ? (edit.pdf_path?.endsWith('.pdf') ? <iframe title="Originele aankoopfactuur" src={pdfUrl} className="h-[650px] w-full border" /> : <img alt="Origineel kasticket" src={pdfUrl} className="max-h-[650px] max-w-full object-contain border" />) : <p className="text-sm text-destructive">Het originele PDF ontbreekt. Simpla geeft momenteel alleen de bestandsnaam door; voeg het gedownloade PDF hierboven toe.</p>}
          <fieldset disabled={edit.status === 'betaald' || edit.status === 'betaling_klaargezet'} className="space-y-3">
          {warnings.length > 0 && (
            <ul className="space-y-1 rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
              {warnings.map((w) => <li key={w}>⚠ {w}</li>)}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label htmlFor="purchase-payment">Betaalwijze</Label><select id="purchase-payment" className="h-10 w-full rounded-md border bg-background px-3" value={edit.payment_method} onChange={e=>setEdit({...edit,payment_method:e.target.value})}>{Object.entries(PAYMENT_METHODS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
            <div className="text-sm"><Label>Aftrekbare btw</Label><p className="font-mono">{euro(deductibleVat(Number(edit.vat),Number(edit.vat_deductible_percent)))} ({edit.vat_deductible_percent}%)</p></div>
            {supplierVatWarning(Number(edit.net),Number(edit.vat),edit.supplier_vat_rule) && <p className="text-sm text-destructive">{supplierVatWarning(Number(edit.net),Number(edit.vat),edit.supplier_vat_rule)}</p>}
            <div className="space-y-1"><Label>Leverancier</Label><Input value={edit.supplier_name} onChange={(e) => setEdit({ ...edit, supplier_name: e.target.value })} /></div>
            <div className="space-y-1"><Label>Btw-nummer</Label><Input value={edit.supplier_vat ?? ""} onChange={(e) => setEdit({ ...edit, supplier_vat: e.target.value || null })} /></div>
            <div className="space-y-1"><Label>IBAN leverancier</Label><Input value={edit.supplier_iban ?? ""} onChange={(e) => setEdit({ ...edit, supplier_iban: e.target.value || null })} /></div>
            <div className="space-y-1"><Label>Factuurnummer</Label><Input value={edit.invoice_number ?? ""} onChange={(e) => setEdit({ ...edit, invoice_number: e.target.value || null })} /></div>
            <div className="space-y-1"><Label>Factuurdatum</Label><Input type="date" value={edit.invoice_date ?? ""} onChange={(e) => setEdit({ ...edit, invoice_date: e.target.value || null })} /></div>
            <div className="space-y-1"><Label>Vervaldag</Label><Input type="date" value={edit.due_date ?? ""} onChange={(e) => setEdit({ ...edit, due_date: e.target.value || null })} /></div>
            <div className="space-y-1"><Label>Netto</Label><Input type="number" step="0.01" value={edit.net} onChange={(e) => setEdit({ ...edit, net: Number(e.target.value) })} /></div>
            <div className="space-y-1"><Label>Btw</Label><Input type="number" step="0.01" value={edit.vat} onChange={(e) => setEdit({ ...edit, vat: Number(e.target.value) })} /></div>
            <div className="space-y-1"><Label>Totaal</Label><Input type="number" step="0.01" value={edit.total} onChange={(e) => setEdit({ ...edit, total: Number(e.target.value) })} /></div>
            <div className="space-y-1 sm:col-span-3"><Label>Mededeling / gestructureerde referentie</Label><Input value={edit.payment_ref ?? ""} onChange={(e) => setEdit({ ...edit, payment_ref: e.target.value || null })} /></div>
          </div>
          <div className="space-y-2">
            <Label>Lijnen</Label>
            {edit.lines.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input className="min-w-48 flex-1" value={l.description} onChange={(e) => setEdit({ ...edit, lines: edit.lines.map((x, n) => (n === i ? { ...x, description: e.target.value } : x)) })} />
                <Input type="number" step="any" className="w-20" value={l.quantity} onChange={(e) => setEdit({ ...edit, lines: edit.lines.map((x, n) => (n === i ? { ...x, quantity: Number(e.target.value) } : x)) })} />
                <Input className="w-16" value={l.unit} onChange={(e) => setEdit({ ...edit, lines: edit.lines.map((x, n) => (n === i ? { ...x, unit: e.target.value } : x)) })} />
                <Input type="number" step="0.01" className="w-28" value={l.unitPrice} onChange={(e) => setEdit({ ...edit, lines: edit.lines.map((x, n) => (n === i ? { ...x, unitPrice: Number(e.target.value) } : x)) })} />
                <span className="w-24 text-right font-mono text-sm">{euro(l.amount)}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEdit({ ...edit, lines: edit.lines.filter((_, n) => n !== i) })}>✕</Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setEdit({ ...edit, lines: [...edit.lines, { description: "", quantity: 1, unit: "st", unitPrice: 0, amount: 0 }] })}>+ Lijn toevoegen</Button>
          </div>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => slaOp()}>Opslaan</Button>
            <Button variant="outline" disabled={busy} onClick={() => slaOp(true)}>Opslaan en goedkeuren</Button>
          </div>
          </fieldset>
        </section>
      )}
    </div>
  );
}
