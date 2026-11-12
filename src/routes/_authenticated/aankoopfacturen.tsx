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
import { Link, useNavigate } from '@tanstack/react-router';
import { findPurchaseDuplicates } from '@/lib/purchase-duplicates';
import { canExportPurchase } from '@/lib/purchase-payment';
import { euro } from "@/lib/billing";
import { purchaseInvoiceWarnings, type PurchaseLine } from "@/lib/purchase-invoice";
import { bookPurchaseInvoice, importFromPeppyrus, listExpenseAccounts, peppyrusStatus, sendPeppyrusTestInvoice, suggestPurchaseAccounts } from "@/lib/purchase-booking.functions";
import { canSendPeppolTest, creditorBank, daysUntilDue, dueLabel, paymentCommunication, paymentMethodLock, supplierBankWarnings } from "@/lib/purchase-booking";
import { deletePurchaseInvoices, attachPurchasePdf, importReceipt, importPurchaseInvoices, paymentFile, setPurchaseInvoiceStatus, updatePurchaseInvoice } from "@/lib/purchase-invoices.functions";
import { MarkPurchasePaid } from '@/components/MarkPurchasePaid';

export const Route = createFileRoute("/_authenticated/aankoopfacturen")({
  head: () => ({ meta: [{ title: "Aankoopfacturen — Riory Werkbonnen" }, { name: "description", content: "Inkomende facturen inlezen, controleren en in bulk betalen op de vervaldag." }, { property: "og:title", content: "Aankoopfacturen — Riory Werkbonnen" }, { property: "og:description", content: "Inkomende facturen inlezen, controleren en in bulk betalen op de vervaldag." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Aankoopfacturen,
});

type Row = {
  id: string; supplier_name: string; supplier_vat: string | null; supplier_iban: string | null; supplier_bic: string | null;
  invoice_number: string | null; invoice_date: string | null; due_date: string | null;
  lines: PurchaseLine[]; net: number; vat: number; total: number; payment_ref: string | null;
  status: string; pdf_path: string | null; created_at: string; kind: 'factuur' | 'creditnota'; paid_at: string | null; bank_payment_ref: string | null;
  payment_method: string; supplier_vat_rule: string; vat_deductible_percent: number; supplier_id?: string | null; booked_at?: string | null;
};

const STATUS: Record<string, string> = { te_controleren: "Te controleren", goedgekeurd: "Goedgekeurd", betaald: "Afgeletterd", betaling_klaargezet: 'Betaling klaargezet' };
const d = (s: string | null) => (s ? new Date(`${s}T12:00:00Z`).toLocaleDateString("nl-BE") : "—");

function Aankoopfacturen() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const doDelete = useServerFn(deletePurchaseInvoices);
  const [onDue, setOnDue] = useState(true);
  const doImport = useServerFn(importPurchaseInvoices);
  const uploadPdf = useServerFn(attachPurchasePdf);
  const uploadTicket = useServerFn(importReceipt);
  const getPeppyrus = useServerFn(peppyrusStatus);
  const doPeppyrus = useServerFn(importFromPeppyrus);
  const sendTest = useServerFn(sendPeppyrusTestInvoice);
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
  /** Sends our own test invoice through Peppol and then reads the inbox back, so one click proves the whole route. */
  async function stuurTest() {
    setBusy(true);
    try {
      const r = await sendTest();
      toast.success(`Testfactuur ${r.number} verstuurd naar ${r.participantId}`);
      await new Promise(res => setTimeout(res, 4000));
      const g = await doPeppyrus();
      if (g.imported) toast.success(`${g.imported} Peppol-factuur/facturen ontvangen`);
      else toast.info('Nog niet aangekomen — haal over een minuut opnieuw op via Peppol');
      g.errors.forEach(e => toast.error(e));
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Testfactuur versturen mislukt'); }
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
      if (row) nav({ to: '/aankoopfacturen/$id', params: { id: row.id } });
      toast.success(r.duplicate ? 'Dit document was al ingelezen' : r.unread ? 'Opgeslagen bij Te controleren — niet automatisch uitgelezen, vul zelf aan' : 'Kasticket ingelezen — te controleren');
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

  async function verwijder() {
    const n = sel.length;
    if (!confirm(`${n} aankoopfactuur/facturen definitief verwijderen? Betaalde of klaargezette facturen worden overgeslagen.`)) return;
    setBusy(true);
    try { const r = await doDelete({ data: { ids: sel } }); toast.success(`${r.deleted} verwijderd${r.skipped ? `, ${r.skipped} overgeslagen` : ''}`); setSel([]); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Verwijderen mislukt'); }
    setBusy(false); refresh();
  }

  async function betaal() {
    const chosen = rows.filter((r) => sel.includes(r.id) && canExportPurchase({ ...r, total: Number(r.total) }));
    const locked = rows.filter((r) => sel.includes(r.id) && paymentMethodLock(r.payment_method, r.status));
    if (locked.length) toast.warning(`${locked.length} factuur/facturen overgeslagen: domiciliëring, kaart of cash wordt nooit manueel betaald`);
    if (!chosen.length) { toast.error("Selecteer goedgekeurde facturen met betaalwijze overschrijving"); return; }
    if (!confirm(`Betaalbestand maken voor ${chosen.length} facturen (${euro(chosen.reduce((s, r) => s + Number(r.total), 0))})? ${onDue ? 'Elke factuur wordt op zijn vervaldag betaald (vervallen facturen vandaag).' : 'Alle facturen worden zo snel mogelijk betaald.'} Laad het bestand daarna in je banktoepassing.`)) return;
    setBusy(true);
    try {
      const r = await payFile({ data: { ids: chosen.map((x) => x.id), onDueDate: onDue } });
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
      const result = await update({
        data: {
          id: edit.id, kind: edit.kind, paymentMethod: edit.payment_method, supplierId: edit.supplier_id ?? null, supplierName: edit.supplier_name, supplierVat: edit.supplier_vat, supplierIban: edit.supplier_iban, supplierBic: edit.supplier_bic,
          invoiceNumber: edit.invoice_number, invoiceDate: edit.invoice_date, dueDate: edit.due_date,
          lines: edit.lines, net: Number(edit.net), vat: Number(edit.vat), total: Number(edit.total), paymentRef: edit.payment_ref,
        },
      });
      if (result.supplierSyncError) toast.warning(`Factuur opgeslagen, maar de leverancier of andere facturen zijn niet bijgewerkt: ${result.supplierSyncError}`);
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
    supplierName: edit.supplier_name, supplierVat: edit.supplier_vat, supplierIban: edit.supplier_iban, supplierBic: edit.supplier_bic,
    invoiceNumber: edit.invoice_number, invoiceDate: edit.invoice_date, dueDate: edit.due_date,
    lines: edit.lines, net: Number(edit.net), vat: Number(edit.vat), total: Number(edit.total), paymentRef: edit.payment_ref,
  }, edit.payment_method, edit.status) : [];

  const editSupplier = edit ? suppliers.find((x) => x.id === edit.supplier_id) : null;
  const bankWarnings = edit ? supplierBankWarnings(editSupplier ? creditorBank(edit, editSupplier) : null, edit.payment_method, edit.status) : [];
  const dups = findPurchaseDuplicates(rows);
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
          <ReceiptScanner disabled={busy} onScan={leesTicket} />
          <Button asChild variant="outline"><Link to="/leveranciers">Leveranciers</Link></Button>
          <Button variant="outline" disabled={busy || !peppyrus?.configured} title={peppyrus?.configured ? undefined : 'Peppyrus is voorbereid maar nog niet gekoppeld'} onClick={vanPeppyrus}>{peppyrus?.configured ? `Ophalen via Peppol${peppyrus.live ? '' : ' (test)'}` : 'Peppol (Peppyrus) — nog niet gekoppeld'}</Button>
          {peppyrus && canSendPeppolTest(peppyrus) ? <Button variant="outline" disabled={busy} title={peppyrus.live ? 'Stuurt een proeffactuur via Peppol naar je eigen adres in de live-omgeving en haalt hem daarna op' : 'Stuurt een proeffactuur naar je eigen Peppol-adres in de testomgeving'} onClick={stuurTest}>Testfactuur ontvangen{peppyrus.live ? ' (live)' : ''}</Button> : null}
          <Button variant="outline" disabled={busy} onClick={importeer}>{busy ? "Bezig…" : "Inlezen uit boekhouding@riory.be"}</Button>
        </div>
      </div>

      {peppyrus?.configured ? (peppyrus.participantId
        ? <p className="text-sm text-muted-foreground">Peppol-adres van deze account: <span className="font-mono">{peppyrus.participantId}</span>{peppyrus.senderId ? <> · verzenden vanaf <span className="font-mono">{peppyrus.senderId}</span></> : ' · verzenden nog niet geregistreerd'}{peppyrus.live ? '' : ' — testomgeving'}</p>
        : <p className="text-sm text-destructive">Peppol nog niet gereed: {peppyrus.error ?? 'geen Peppol-adres gekend'}</p>) : null}

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
        <input id="receipt-upload" type="file" multiple hidden accept="application/pdf,image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={(e) => { if (e.target.files) void leesBestanden(e.target.files); e.target.value = ''; }} />
        {busy && <span role="status">Document wordt verwerkt…</span>}
      </div>
      <p className="text-sm text-muted-foreground">Afletteren van betalingen gebeurt automatisch in Boekhouding → Bank.</p>

      <div className="flex flex-wrap items-center gap-2">
        {([['te_controleren', 'Te controleren'], ['goedgekeurd', 'Gecontroleerd'], ['betaald', 'Betaald'], ['alle', 'Alle']] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={tab === k ? 'default' : 'outline'} onClick={() => { setTab(k); setSel([]); }}>{l}{k !== 'alle' ? ` (${count(k)})` : ''}</Button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          {payable.length > 0 && <Button size="sm" variant="outline" onClick={() => setSel(payable.map((r) => r.id))}>Alles betaalbaar selecteren ({payable.length})</Button>}
          <Button size="sm" variant="outline" disabled={!sel.length || busy} onClick={() => markeer("goedgekeurd")}>Gecontroleerd ({sel.length})</Button>
          {dups.size > 0 && <Button size="sm" variant="outline" onClick={() => setSel(visible.filter((r) => dups.has(r.id)).map((r) => r.id))}>Dubbele selecteren ({visible.filter((r) => dups.has(r.id)).length})</Button>}
          <Button size="sm" variant="outline" className="text-destructive" disabled={!sel.length || busy} onClick={verwijder}>Verwijderen ({sel.length})</Button>
          <select aria-label="Betaaldatum" className="h-9 rounded-md border bg-background px-2 text-sm" value={onDue ? 'due' : 'now'} onChange={(e) => setOnDue(e.target.value === 'due')}>
            <option value="due">Betalen op vervaldag</option>
            <option value="now">Zo snel mogelijk betalen</option>
          </select>
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
          const bankMissing = !paid && supplierBankWarnings(creditorBank(r, sup), r.payment_method, r.status).length > 0;
          return (
          <li key={r.id} className={`flex flex-wrap items-center gap-3 p-3 ${paid ? 'bg-accent/40' : due.overdue ? 'bg-destructive/10' : ''}`}>
            <input type="checkbox" aria-label={`Selecteer factuur ${r.invoice_number ?? r.supplier_name}`} className="h-5 w-5 accent-primary" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} />
            <span className="font-bold">{r.supplier_name}</span>
            <span className="font-mono text-sm">{r.invoice_number ?? "—"}</span>
            {r.kind === 'creditnota' && <span className="text-sm font-bold text-destructive">Creditnota</span>}
            <span className="text-sm text-muted-foreground">Factuurdatum {d(r.invoice_date)}</span>
            <span className="text-sm text-muted-foreground">vervaldag {d(r.due_date)}</span>
            {!paid && <span className={`rounded px-2 py-0.5 text-xs font-bold ${due.overdue ? 'bg-destructive text-destructive-foreground' : due.soon ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{due.text}</span>}
            {lock && <span className="rounded border border-destructive px-2 py-0.5 text-xs font-bold text-destructive">{lock}</span>}
            {bankMissing && <span className="text-xs font-bold text-destructive">⚠ IBAN/BIC leverancier</span>}
            {dups.has(r.id) && <span className="rounded bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground" title="Zelfde leverancier en factuurnummer (of datum en bedrag) als een eerder ingelezen factuur">Dubbel?</span>}
            {r.booked_at && <span className="text-xs text-muted-foreground">Geboekt</span>}
            <span className="ml-auto font-mono">{euro(r.kind === 'creditnota' ? -Math.abs(Number(r.total)) : Number(r.total))}</span>
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${paid ? "bg-accent text-accent-foreground" : r.status === "goedgekeurd" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {paid ? '✓ BETAALD' : STATUS[r.status] ?? r.status}
            </span>
            {r.paid_at && <span className="text-xs text-muted-foreground" title={r.bank_payment_ref ?? undefined}>op {new Date(r.paid_at).toLocaleDateString('nl-BE')}</span>}
            <Button asChild variant="outline" size="sm"><Link to="/aankoopfacturen/$id" params={{ id: r.id }}>{paid ? 'Bekijken' : 'Controleren'}</Link></Button>
            {!paid && r.kind === 'factuur' && <MarkPurchasePaid id={r.id} staged={r.status === 'betaling_klaargezet'} disabled={busy} onSaved={async () => { setSel(s => s.filter(id => id !== r.id)); await Promise.all([refresh(), qc.invalidateQueries({ queryKey: ['purchase_queue'] })]); }} />}
          </li>);
        })}
      </ul>

    </div>
  );
}
