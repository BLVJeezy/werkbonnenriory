import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PAYMENT_METHODS, deductibleVat, supplierVatWarning } from "@/lib/supplier-rules";
import { euro } from "@/lib/billing";
import { purchaseInvoiceWarnings, type PurchaseLine } from "@/lib/purchase-invoice";
import { bookPurchaseInvoice, listExpenseAccounts, suggestPurchaseAccounts } from "@/lib/purchase-booking.functions";
import { paymentCommunication, paymentMethodLock, supplierBankWarnings, creditorBank } from "@/lib/purchase-booking";
import { attachPurchasePdf, setPurchaseInvoiceStatus, updatePurchaseInvoice } from "@/lib/purchase-invoices.functions";

export const Route = createFileRoute("/_authenticated/aankoopfacturen_/$id")({
  head: () => ({ meta: [{ title: "Aankoopfactuur controleren — Riory Werkbonnen" }, { name: "description", content: "Aankoopfactuur naast het originele document controleren en boeken." }, { property: "og:title", content: "Aankoopfactuur controleren — Riory Werkbonnen" }, { property: "og:description", content: "Aankoopfactuur naast het originele document controleren en boeken." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Controle,
});

/** Purchase VAT always lands on the recoverable-VAT account, the same one the journal posting uses. */
const VAT_ACCOUNT = { number: "411000", name: "Terug te vorderen btw" };

type Row = {
  id: string; supplier_name: string; supplier_vat: string | null; supplier_iban: string | null; supplier_bic: string | null;
  invoice_number: string | null; invoice_date: string | null; due_date: string | null;
  lines: PurchaseLine[]; net: number; vat: number; total: number; payment_ref: string | null;
  status: string; pdf_path: string | null; kind: "factuur" | "creditnota"; paid_at: string | null;
  payment_method: string; supplier_vat_rule: string; vat_deductible_percent: number; supplier_id: string | null;
};

function Controle() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const update = useServerFn(updatePurchaseInvoice);
  const setStatus = useServerFn(setPurchaseInvoiceStatus);
  const uploadPdf = useServerFn(attachPurchasePdf);
  const getAccounts = useServerFn(listExpenseAccounts);
  const suggest = useServerFn(suggestPurchaseAccounts);
  const book = useServerFn(bookPurchaseInvoice);
  const { data: accounts = [] } = useQuery({ queryKey: ["expense-accounts"], queryFn: () => getAccounts() });
  const { data: suppliers = [] } = useQuery({ queryKey: ["suppliers"], queryFn: async () => (await supabase.from("suppliers").select("*").order("name")).data ?? [] });
  const { data: queue = [] } = useQuery({ queryKey: ["purchase_queue"], queryFn: async () => (await supabase.from("purchase_invoices").select("id").eq("status", "te_controleren").order("created_at", { ascending: false })).data ?? [] });
  const [edit, setEdit] = useState<Row | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [sources, setSources] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [syncSupplier, setSyncSupplier] = useState(true);

  async function load() {
    const { data: r } = await supabase.from("purchase_invoices").select("*").eq("id", id).single();
    if (!r) { toast.error("Factuur niet gevonden"); return; }
    const row = { ...r, kind: r.kind === "creditnota" ? "creditnota" : "factuur", lines: (r.lines ?? []) as PurchaseLine[] } as Row;
    setEdit(row); setSources({}); setPdfUrl(null); setSyncSupplier(true);
    if (row.pdf_path) {
      const { data } = await supabase.storage.from("aankoopfacturen").createSignedUrl(row.pdf_path, 3600);
      setPdfUrl(data?.signedUrl ?? null);
    }
    if (row.status !== "betaald" && row.lines.some((l) => !l.account)) {
      try {
        const s = await suggest({ data: { supplierId: row.supplier_id, supplierName: row.supplier_name, lines: row.lines } });
        setEdit((e) => e && e.id === row.id ? { ...e, lines: e.lines.map((l, i) => l.account ? l : { ...l, account: s[i]?.account ?? null }) } : e);
        setSources(Object.fromEntries(s.map((x, i) => [i, x.source ?? ""])));
      } catch { /* suggestions are optional */ }
    }
  }
  useEffect(() => { void load(); }, [id]);

  // Next = the next invoice still to check after this one, wrapping to the first.
  const others = queue.filter((q) => q.id !== id);
  const idx = queue.findIndex((q) => q.id === id);
  const nextId = (idx >= 0 ? queue.slice(idx + 1).find((q) => q.id !== id) : null)?.id ?? others[0]?.id ?? null;

  async function save(opts: { approve?: boolean; next?: boolean; bookLines?: boolean } = {}) {
    if (!edit) return;
    setBusy(true);
    try {
      await update({ data: {
        id: edit.id, kind: edit.kind, paymentMethod: edit.payment_method, supplierId: edit.supplier_id, supplierName: edit.supplier_name, supplierVat: edit.supplier_vat, supplierIban: edit.supplier_iban,
        invoiceNumber: edit.invoice_number, invoiceDate: edit.invoice_date, dueDate: edit.due_date,
        lines: edit.lines, net: Number(edit.net), vat: Number(edit.vat), total: Number(edit.total), paymentRef: edit.payment_ref,
      } });
      if (opts.bookLines) await book({ data: { id: edit.id, lines: edit.lines } });
      if (opts.approve) await setStatus({ data: { ids: [edit.id], status: "goedgekeurd" } });
      await qc.invalidateQueries({ queryKey: ["purchase_invoices"] });
      await qc.invalidateQueries({ queryKey: ["purchase_queue"] });
      toast.success(opts.bookLines ? "Opgeslagen en geboekt" : "Opgeslagen");
      if (opts.next) {
        if (nextId) nav({ to: "/aankoopfacturen/$id", params: { id: nextId } });
        else { toast.info("Alle facturen zijn gecontroleerd"); nav({ to: "/aankoopfacturen" }); }
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
    setBusy(false);
  }

  async function voegPdfToe(file: File | undefined) {
    if (!file || !edit) return;
    if (file.size > 10000000) { toast.error("Kies een PDF van maximaal 10 MB"); return; }
    setBusy(true);
    try {
      const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = rej; r.readAsDataURL(file); });
      await uploadPdf({ data: { id: edit.id, base64 } });
      await load(); toast.success("Origineel PDF toegevoegd");
    } catch (e) { toast.error(e instanceof Error ? e.message : "PDF toevoegen mislukt"); }
    setBusy(false);
  }

  if (!edit) return <p className="p-4 text-muted-foreground">Factuur laden…</p>;

  const sup = suppliers.find((x) => x.id === edit.supplier_id) ?? null;
  const warnings = [...new Set([...supplierBankWarnings(sup ?? (edit.supplier_iban ? { iban: edit.supplier_iban, bic: null } : null)), ...purchaseInvoiceWarnings({
    supplierName: edit.supplier_name, supplierVat: edit.supplier_vat, supplierIban: edit.supplier_iban,
    invoiceNumber: edit.invoice_number, invoiceDate: edit.invoice_date, dueDate: edit.due_date,
    lines: edit.lines, net: Number(edit.net), vat: Number(edit.vat), total: Number(edit.total), paymentRef: edit.payment_ref,
  })])];
  const isPaid = edit.status === "betaald";
  const locked = isPaid || edit.status === "betaling_klaargezet";
  const signedTotal = edit.kind === "creditnota" ? -Math.abs(Number(edit.total)) : Number(edit.total);
  const upd = (i: number, patch: Partial<PurchaseLine>) => setEdit({ ...edit, lines: edit.lines.map((x, n) => (n === i ? { ...x, ...patch } : x)) });
  const isImage = edit.pdf_path && !edit.pdf_path.toLowerCase().endsWith(".pdf");
  const canBook = !edit.lines.some((l) => !l.account);

  return (
    <div className="flex h-[calc(100dvh-7rem)] min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm"><Link to="/aankoopfacturen">← Lijst</Link></Button>
        <h1 className="text-xl font-black uppercase">{edit.supplier_name} <span className="font-mono text-base">{edit.invoice_number ?? ""}</span></h1>
        {queue.length > 0 && <span className="text-sm text-muted-foreground">{queue.length} te controleren</span>}
        {nextId && <Button variant="ghost" size="sm" className="ml-auto" onClick={() => nav({ to: "/aankoopfacturen/$id", params: { id: nextId } })}>Overslaan →</Button>}
      </div>
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
        <div className="flex min-h-[50vh] flex-col gap-2 md:min-h-0">
          {pdfUrl
            ? (isImage ? <img alt="Origineel aankoopdocument" src={pdfUrl} className="min-h-0 flex-1 border object-contain" /> : <iframe title="Origineel aankoopfactuur" src={pdfUrl} className="min-h-0 w-full flex-1 border" />)
            : <div className="flex flex-1 items-center justify-center border border-dashed p-4 text-sm text-destructive">Het originele document ontbreekt.</div>}
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="purchase-pdf" className="text-xs">{edit.pdf_path ? "Ander PDF" : "Origineel PDF toevoegen"}</Label>
            <Input id="purchase-pdf" className="h-8 max-w-60" type="file" accept="application/pdf,.pdf" disabled={busy} onChange={(e) => { void voegPdfToe(e.target.files?.[0]); e.target.value = ""; }} />
            {pdfUrl && <Button asChild variant="outline" size="sm"><a href={pdfUrl} target="_blank" rel="noreferrer">In nieuw venster</a></Button>}
          </div>
        </div>

        <div className="min-h-0 min-w-0 overflow-y-auto pr-2">
          <fieldset disabled={locked} className="space-y-3">
            {isPaid && <div className="rounded-md border-2 border-accent bg-accent p-3 font-black text-accent-foreground">✓ BETAALD{edit.paid_at ? ` op ${new Date(edit.paid_at).toLocaleDateString("nl-BE")}` : ""}</div>}
            {!isPaid && paymentMethodLock(edit.payment_method, edit.status) && <div className="rounded-md border-2 border-destructive p-2 text-sm font-bold text-destructive">{paymentMethodLock(edit.payment_method, edit.status)}</div>}
            {warnings.length > 0 && <ul className="space-y-1 rounded-md border border-destructive bg-destructive/10 p-2 text-sm">{warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}

            <div className="space-y-1">
              <Label htmlFor="purchase-supplier">Leverancier</Label>
              <select id="purchase-supplier" className={`h-10 w-full rounded-md border bg-background px-3 ${!sup ? "border-destructive" : ""}`} value={edit.supplier_id ?? ""} onChange={(e) => { const s2 = suppliers.find((x) => x.id === e.target.value); if (s2) setEdit({ ...edit, supplier_id: s2.id, supplier_name: s2.name, supplier_vat: s2.vat_number, supplier_iban: s2.iban ?? edit.supplier_iban, payment_method: s2.payment_method }); }}>
                {!sup && <option value="">— Kies uit leverancierslijst (uitgelezen: {edit.supplier_name}) —</option>}
                {suppliers.map((x) => <option key={x.id} value={x.id}>{x.name}{x.vat_number ? ` (${x.vat_number})` : ""}</option>)}
              </select>
              {!sup && <p className="text-xs text-muted-foreground">Staat de leverancier er niet tussen? <Link to="/leveranciers" className="underline">Voeg ze toe in de leverancierslijst</Link>.</p>}
            </div>

            <details className="rounded-md border p-2">
              <summary className="cursor-pointer text-sm font-bold">Leveranciersgegevens{sup ? `: ${sup.vat_number ?? "geen btw-nr."} · ${sup.iban ?? edit.supplier_iban ?? "geen IBAN"}` : ""}</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="space-y-1"><Label>Btw-nummer</Label><Input value={edit.supplier_vat ?? ""} onChange={(e) => setEdit({ ...edit, supplier_vat: e.target.value || null })} /></div>
                <div className="space-y-1"><Label>IBAN</Label><Input value={edit.supplier_iban ?? ""} onChange={(e) => setEdit({ ...edit, supplier_iban: e.target.value || null })} /></div>
                <div className="space-y-1 sm:col-span-2"><Label htmlFor="purchase-payment">Betaalwijze</Label><select id="purchase-payment" className="h-10 w-full rounded-md border bg-background px-3" value={edit.payment_method} onChange={(e) => setEdit({ ...edit, payment_method: e.target.value })}>{Object.entries(PAYMENT_METHODS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
              </div>
            </details>

            <div className="flex items-center gap-2">
              <Checkbox id="purchase-credit" checked={edit.kind === "creditnota"} onCheckedChange={(c) => setEdit({ ...edit, kind: c === true ? "creditnota" : "factuur" })} />
              <Label htmlFor="purchase-credit">Dit is een creditnota</Label>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1"><Label>Factuurnummer</Label><Input value={edit.invoice_number ?? ""} onChange={(e) => setEdit({ ...edit, invoice_number: e.target.value || null })} /></div>
              <div className="space-y-1"><Label>Factuurdatum</Label><Input type="date" value={edit.invoice_date ?? ""} onChange={(e) => setEdit({ ...edit, invoice_date: e.target.value || null })} /></div>
              <div className="space-y-1"><Label>Vervaldag</Label><Input type="date" value={edit.due_date ?? ""} onChange={(e) => setEdit({ ...edit, due_date: e.target.value || null })} /></div>
              <div className="space-y-1 sm:col-span-3"><Label>Betalingskenmerk</Label><Input value={edit.payment_ref ?? ""} onChange={(e) => setEdit({ ...edit, payment_ref: e.target.value || null })} />
                <p className="text-xs text-muted-foreground">Mededeling: {paymentCommunication(edit.payment_ref, edit.invoice_number) ?? "—"}</p></div>
            </div>

            <div className="space-y-2">
              <Label>Lijnen en boeking</Label>
              {edit.lines.map((l, i) => (
                <div key={i} className="space-y-1 rounded-md border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input className="min-w-32 flex-1" value={l.description} onChange={(e) => upd(i, { description: e.target.value })} />
                    <Input type="number" step="any" className="w-16" aria-label="Aantal" value={l.quantity} onChange={(e) => upd(i, { quantity: Number(e.target.value) })} />
                    <Input type="number" step="0.01" className="w-24" aria-label="Bedrag" value={l.amount} onChange={(e) => upd(i, { amount: Number(e.target.value) })} />
                    <Button type="button" size="sm" variant="ghost" aria-label="Lijn verwijderen" onClick={() => setEdit({ ...edit, lines: edit.lines.filter((_, n) => n !== i) })}>✕</Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <select aria-label="Grootboekrekening" className={`h-9 flex-1 rounded-md border bg-background px-2 text-sm ${!l.account ? "border-destructive" : ""}`} value={l.account ?? ""} onChange={(e) => upd(i, { account: e.target.value || null })}>
                      <option value="">— Kies rekening —</option>
                      {accounts.map((a) => <option key={a.number} value={a.number}>{a.number} {a.name}</option>)}
                    </select>
                    {sources[i] && <span className="text-xs text-muted-foreground">{sources[i] === "geleerd" ? "geleerd" : "AI-voorstel"}</span>}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-md border bg-muted/50 p-2 text-sm">
                <span>Btw {euro(Number(edit.vat))} → <span className="font-mono">{VAT_ACCOUNT.number}</span> {VAT_ACCOUNT.name}</span>
                <span className="text-xs text-muted-foreground">automatisch</span>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setEdit({ ...edit, lines: [...edit.lines, { description: "", quantity: 1, unit: "st", unitPrice: 0, amount: 0 }] })}>+ Lijn toevoegen</Button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><Label>Netto</Label><Input type="number" step="0.01" value={edit.net} onChange={(e) => setEdit({ ...edit, net: Number(e.target.value) })} /></div>
              <div><Label>Btw</Label><Input type="number" step="0.01" value={edit.vat} onChange={(e) => setEdit({ ...edit, vat: Number(e.target.value) })} /></div>
              <div><Label>Totaal</Label><Input type="number" step="0.01" value={edit.total} onChange={(e) => setEdit({ ...edit, total: Number(e.target.value) })} /></div>
            </div>
            <p className="text-xs text-muted-foreground">Aftrekbare btw: {euro(deductibleVat(Number(edit.vat), Number(edit.vat_deductible_percent)))} ({edit.vat_deductible_percent}%){supplierVatWarning(Number(edit.net), Number(edit.vat), edit.supplier_vat_rule) ? ` — ${supplierVatWarning(Number(edit.net), Number(edit.vat), edit.supplier_vat_rule)}` : ""}</p>
            <div className="flex items-center justify-between rounded-md border-2 border-primary p-2">
              <span className="font-black uppercase">{edit.kind === "creditnota" ? "Te ontvangen" : "Te betalen"}</span>
              <span className="font-mono text-xl font-black">{euro(signedTotal)}</span>
            </div>
          </fieldset>
          {!locked && (
            <div className="sticky bottom-0 mt-3 flex flex-wrap gap-2 border-t bg-background py-2">
              <Button disabled={busy || !sup || !canBook} title={!sup ? "Kies eerst een leverancier" : !canBook ? "Kies voor elke lijn een rekening" : undefined} onClick={() => save({ approve: true, bookLines: true, next: true })}>Opslaan en volgende →</Button>
              <Button variant="outline" disabled={busy} onClick={() => save()}>Opslaan</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
