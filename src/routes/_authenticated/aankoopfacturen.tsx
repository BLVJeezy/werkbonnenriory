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
  payment_method: string; supplier_vat_rule: string; vat_deductible_percent: number; supplier_id?: string | null; booked_at?: string | null;
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
      const r = await suggest({ data: { supplierId: row.supplier_id ?? null, supplierName: row.supplier_name, lines: row.lines } });
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
          id: edit.id, kind: edit.kind, paymentMethod: edit.payment_method, supplierId: edit.supplier_id ?? null, supplierName: edit.supplier_name, supplierVat: edit.supplier_vat, supplierIban: edit.supplier_iban,
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

  const editSupplier = edit ? suppliers.find((x) => x.id === edit.supplier_id) : null;
  const bankWarnings = edit ? supplierBankWarnings(editSupplier ?? (edit.supplier_iban ? { iban: edit.supplier_iban, bic: null } : null)) : [];
  const visible = rows.filter((r) => tab === 'alle' ? true : tab === 'goedgekeurd' ? ['goedgekeurd', 'betaling_klaargezet'].includes(r.status) : r.status === tab);
  const count = (t: string) => rows.filter((r) => t === 'goedgekeurd' ? ['goedgekeurd', 'betaling_klaargezet'].includes(r.status) : r.status === t).length;
  const payable = visible.filter((r) => canExportPurchase({ ...r, total: Number(r.total) }));
  const isPaid = edit?.status === 'betaald';
  const signedTotal = edit ? (edit.kind === 'creditnota' ? -Math.abs(Number(edit.total)) : Number(edit.total)) : 0;
  const upd = (i: number, patch: Partial<PurchaseLine>) => edit && setEdit({ ...edit, lines: edit.lines.map((x, n) => (n === i ? { ...x, ...patch } : x)) });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-black uppercase">Aankoopfacturen</h1>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link to="/leveranciers">Leveranciers</Link></Button>
          <Button variant="outline" disabled={busy || !peppyrus?.configured} title={peppyrus?.configured ? undefined : 'Peppyrus is voorbereid maar nog niet gekoppeld'} onClick={vanPeppyrus}>{peppyrus?.configured ? `Ophalen via Peppol${peppyrus.live ? '' : ' (test)'}` : 'Peppol (Peppyrus) — nog niet gekoppeld'}</Button>
          <Button variant="outline" disabled={busy} onClick={importeer}>{busy ? "Bezig…" : "Inlezen vanuit mail"}</Button>
          <Button variant="outline" disabled={busy} onClick={vanSimpla}>Inlezen uit Simpla</Button>
        </div>
      </div>

      <div
        role="button" tabIndex={0} aria-label="Facturen of kastickets hierheen slepen"
        onClick={() => document.getElementById('receipt-upload')?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter') document.getElementById('receipt-upload')?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void leesBestanden(e.dataTransfer.files); }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed p-6 text-center ${drag ? 'border-primary bg-primary/10' : 'border-border bg-card'}`}
      >
        <span className="font-bold">Sleep hier facturen, buitenlandse facturen of btw-ticketjes</span>
        <span className="text-sm text-muted-foreground">PDF, JPG, PNG of WebP — leverancier, lijnen, vervaldag en betalingskenmerk worden automatisch uitgelezen</span>
        <input id="receipt-upload" type="file" multiple hidden accept="application/pdf,image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => { if (e.target.files) void leesBestanden(e.target.files); e.target.value = ''; }} />
        {busy && <span role="status">Document wordt verwerkt…</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3"><ReceiptScanner disabled={busy} onScan={leesTicket} /><span className="text-sm text-muted-foreground">Afletteren van betalingen gebeurt automatisch in Boekhouding → Bank.</span></div>

      <div className="flex flex-wrap items-center gap-2">
        {([['te_controleren', 'Te controleren'], ['goedgekeurd', 'Gecontroleerd'], ['betaald', 'Betaald'], ['alle', 'Alle']] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={tab === k ? 'default' : 'outline'} onClick={() => { setTab(k); setSel([]); }}>{l}{k !== 'alle' ? ` (${count(k)})` : ''}</Button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          {payable.length > 0 && <Button size="sm" variant="outline" onClick={() => setSel(payable.map((r) => r.id))}>Alles betaalbaar selecteren ({payable.length})</Button>}
          <Button size="sm" variant="outline" disabled={!sel.length || busy} onClick={() => markeer("goedgekeurd")}>Gecontroleerd ({sel.length})</Button>
          <Button size="sm" disabled={!sel.length || busy} onClick={betaal}>SEPA-betaalbestand maken</Button>
        </div>
      </div>

      <ul className="divide-y rounded-md border bg-card">
        {visible.length === 0 && <li className="p-4 text-muted-foreground">Geen aankoopfacturen in deze lijst.</li>}
        {visible.map((r) => {
          const paid = r.status === 'betaald';
          const due = dueLabel(daysUntilDue(r.due_date, today));
          const lock = paymentMethodLock(r.payment_method, r.status);
          const sup = suppliers.find((x) => x.id === r.supplier_id);
          const bankMissing = !paid && supplierBankWarnings(sup ?? null).length > 0;
          return (
          <li key={r.id} className={`flex flex-wrap items-center gap-3 p-3 ${paid ? 'bg-accent/40' : due.overdue ? 'bg-destructive/10' : ''}`}>
            <input type="checkbox" aria-label={`Selecteer factuur ${r.invoice_number ?? r.supplier_name}`} className="h-5 w-5 accent-primary" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} />
            <span className="font-bold">{r.supplier_name}</span>
            <span className="font-mono text-sm">{r.invoice_number ?? "—"}</span>
            {r.kind === 'creditnota' && <span className="text-sm font-bold text-destructive">Creditnota</span>}
            <span className="text-sm text-muted-foreground">vervaldag {d(r.due_date)}</span>
            {!paid && <span className={`rounded px-2 py-0.5 text-xs font-bold ${due.overdue ? 'bg-destructive text-destructive-foreground' : due.soon ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{due.text}</span>}
            {lock && <span className="rounded border border-destructive px-2 py-0.5 text-xs font-bold text-destructive">{lock}</span>}
            {bankMissing && <span className="text-xs font-bold text-destructive">⚠ IBAN/BIC leverancier</span>}
            {r.booked_at && <span className="text-xs text-muted-foreground">Geboekt</span>}
            <span className="ml-auto font-mono">{euro(r.kind === 'creditnota' ? -Math.abs(Number(r.total)) : Number(r.total))}</span>
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${paid ? "bg-accent text-accent-foreground" : r.status === "goedgekeurd" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {paid ? '✓ BETAALD' : STATUS[r.status] ?? r.status}
            </span>
            {r.paid_at && <span className="text-xs text-muted-foreground" title={r.bank_payment_ref ?? undefined}>op {new Date(r.paid_at).toLocaleDateString('nl-BE')}</span>}
            <Button variant="outline" size="sm" onClick={() => openControle({ ...r, kind: r.kind === 'creditnota' ? 'creditnota' : 'factuur', lines: (r.lines ?? []) as PurchaseLine[] })}>{paid ? 'Bekijken' : 'Controleren'}</Button>
          </li>);
        })}
      </ul>

      {edit && (
        <section className="space-y-3 border-t pt-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black uppercase">Controleren: {edit.supplier_name}</h2>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setEdit(null)}>Sluiten</Button>
          </div>
          {isPaid && <div className="rounded-md border-2 border-accent bg-accent p-3 text-lg font-black text-accent-foreground">✓ BETAALD{edit.paid_at ? ` op ${new Date(edit.paid_at).toLocaleDateString('nl-BE')}` : ''} — afgeletterd in de boekhouding</div>}
          {!isPaid && paymentMethodLock(edit.payment_method, edit.status) && <div className="rounded-md border-2 border-destructive p-3 font-bold text-destructive">{paymentMethodLock(edit.payment_method, edit.status)} — blijft zo gelabeld tot de betaling is afgeletterd.</div>}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              {pdfUrl ? (edit.pdf_path?.endsWith('.pdf') ? <iframe title="Voorbeeld aankoopfactuur" src={pdfUrl} className="h-[75vh] w-full border" /> : <img alt="Voorbeeld aankoopdocument" src={pdfUrl} className="max-h-[75vh] max-w-full border object-contain" />) : <p className="text-sm text-destructive">Het originele document ontbreekt; voeg het PDF hieronder toe.</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="purchase-pdf">Origineel PDF toevoegen</Label>
                <Input id="purchase-pdf" className="max-w-72" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={e => { void voegPdfToe(e.target.files?.[0], edit); e.target.value = ''; }} />
                {edit.pdf_path && <Button variant="outline" size="sm" onClick={() => { if (edit.pdf_path) void bekijkPdf(edit.pdf_path); }}>In nieuw venster</Button>}
              </div>
            </div>
            <fieldset disabled={isPaid || edit.status === 'betaling_klaargezet'} className="space-y-3">
              {[...bankWarnings, ...warnings].length > 0 && (
                <ul className="space-y-1 rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
                  {[...new Set([...bankWarnings, ...warnings])].map((w) => <li key={w}>⚠ {w}</li>)}
                </ul>
              )}
              <div className="flex items-center gap-2">
                <Checkbox id="purchase-credit" checked={edit.kind === 'creditnota'} onCheckedChange={checked => setEdit({ ...edit, kind: checked === true ? 'creditnota' : 'factuur' })} />
                <Label htmlFor="purchase-credit">Dit is een creditnota</Label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2"><Label htmlFor="purchase-supplier">Leverancier</Label>
                  <select id="purchase-supplier" className="h-10 w-full rounded-md border bg-background px-3" value={edit.supplier_id ?? ''} onChange={(e) => { const s2 = suppliers.find((x) => x.id === e.target.value); if (s2) setEdit({ ...edit, supplier_id: s2.id, supplier_name: s2.name, supplier_vat: s2.vat_number, supplier_iban: s2.iban ?? edit.supplier_iban, payment_method: s2.payment_method } as Row); }}>
                    <option value="">— Uitgelezen: {edit.supplier_name} —</option>
                    {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}{x.vat_number ? ` (${x.vat_number})` : ''}</option>)}
                  </select>
                </div>
                <div className="space-y-1"><Label>Btw-nummer</Label><Input value={edit.supplier_vat ?? ""} onChange={(e) => setEdit({ ...edit, supplier_vat: e.target.value || null })} /></div>
                <div className="space-y-1"><Label>IBAN leverancier</Label><Input value={edit.supplier_iban ?? ""} onChange={(e) => setEdit({ ...edit, supplier_iban: e.target.value || null })} /></div>
                <div className="space-y-1"><Label htmlFor="purchase-payment">Betaalwijze</Label><select id="purchase-payment" className="h-10 w-full rounded-md border bg-background px-3" value={edit.payment_method} onChange={e=>setEdit({...edit,payment_method:e.target.value})}>{Object.entries(PAYMENT_METHODS).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>
                <div className="space-y-1"><Label>Factuurnummer</Label><Input value={edit.invoice_number ?? ""} onChange={(e) => setEdit({ ...edit, invoice_number: e.target.value || null })} /></div>
                <div className="space-y-1"><Label>Factuurdatum</Label><Input type="date" value={edit.invoice_date ?? ""} onChange={(e) => setEdit({ ...edit, invoice_date: e.target.value || null })} /></div>
                <div className="space-y-1"><Label>Vervaldag</Label><Input type="date" value={edit.due_date ?? ""} onChange={(e) => setEdit({ ...edit, due_date: e.target.value || null })} /></div>
                <div className="space-y-1 sm:col-span-2"><Label>Betalingskenmerk</Label><Input value={edit.payment_ref ?? ""} placeholder={edit.invoice_number ? `Geen kenmerk — mededeling wordt "Factuur ${edit.invoice_number}"` : ''} onChange={(e) => setEdit({ ...edit, payment_ref: e.target.value || null })} />
                  <p className="text-xs text-muted-foreground">Mededeling bij betaling: {paymentCommunication(edit.payment_ref, edit.invoice_number) ?? '—'}</p></div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2"><Label>Lijnen en boeking</Label><Button type="button" size="sm" variant="outline" className="ml-auto" disabled={busy} onClick={() => void stelVoor(edit)}>Rekeningen voorstellen</Button></div>
                {edit.lines.map((l, i) => (
                  <div key={i} className="space-y-1 rounded-md border p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input className="min-w-40 flex-1" value={l.description} onChange={(e) => upd(i, { description: e.target.value })} />
                      <Input type="number" step="any" className="w-20" aria-label="Aantal" value={l.quantity} onChange={(e) => upd(i, { quantity: Number(e.target.value) })} />
                      <Input type="number" step="0.01" className="w-24" aria-label="Eenheidsprijs" value={l.unitPrice} onChange={(e) => upd(i, { unitPrice: Number(e.target.value) })} />
                      <Input type="number" step="0.01" className="w-24" aria-label="Bedrag" value={l.amount} onChange={(e) => upd(i, { amount: Number(e.target.value) })} />
                      <Button type="button" size="sm" variant="ghost" aria-label="Lijn verwijderen" onClick={() => setEdit({ ...edit, lines: edit.lines.filter((_, n) => n !== i) })}>✕</Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <select aria-label="Grootboekrekening" className={`h-9 flex-1 rounded-md border bg-background px-2 text-sm ${!l.account ? 'border-destructive' : ''}`} value={l.account ?? ''} onChange={(e) => upd(i, { account: e.target.value || null })}>
                        <option value="">— Kies rekening —</option>
                        {accounts.map((a) => <option key={a.number} value={a.number}>{a.number} {a.name}</option>)}
                      </select>
                      {sources[i] && <span className="text-xs text-muted-foreground">{sources[i] === 'geleerd' ? 'geleerd' : 'AI-voorstel'}</span>}
                    </div>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={() => setEdit({ ...edit, lines: [...edit.lines, { description: "", quantity: 1, unit: "st", unitPrice: 0, amount: 0 }] })}>+ Lijn toevoegen</Button>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><Label>Netto</Label><Input type="number" step="0.01" value={edit.net} onChange={(e) => setEdit({ ...edit, net: Number(e.target.value) })} /></div>
                <div><Label>Btw</Label><Input type="number" step="0.01" value={edit.vat} onChange={(e) => setEdit({ ...edit, vat: Number(e.target.value) })} /></div>
                <div><Label>Totaal</Label><Input type="number" step="0.01" value={edit.total} onChange={(e) => setEdit({ ...edit, total: Number(e.target.value) })} /></div>
              </div>
              <p className="text-xs text-muted-foreground">Aftrekbare btw: {euro(deductibleVat(Number(edit.vat),Number(edit.vat_deductible_percent)))} ({edit.vat_deductible_percent}%){supplierVatWarning(Number(edit.net),Number(edit.vat),edit.supplier_vat_rule) ? ` — ${supplierVatWarning(Number(edit.net),Number(edit.vat),edit.supplier_vat_rule)}` : ''}</p>
              <div className={`flex items-center justify-between rounded-md border-2 p-3 ${isPaid ? 'border-accent bg-accent text-accent-foreground' : 'border-primary'}`}>
                <span className="font-black uppercase">{isPaid ? 'Betaald' : edit.kind === 'creditnota' ? 'Te ontvangen' : 'Totaal te betalen'}</span>
                <span className="font-mono text-2xl font-black">{euro(signedTotal)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => slaOp()}>Opslaan</Button>
                <Button variant="outline" disabled={busy || edit.lines.some((l) => !l.account)} onClick={boek}>Lijnen boeken</Button>
                <Button variant="outline" disabled={busy} onClick={() => slaOp(true)}>Opslaan en gecontroleerd</Button>
              </div>
            </fieldset>
          </div>
        </section>
      )}
    </div>
  );
}
