import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { euro } from "@/lib/billing";
import { purchaseInvoiceWarnings, type PurchaseLine } from "@/lib/purchase-invoice";
import { importPurchaseInvoices, paymentFile, setPurchaseInvoiceStatus, updatePurchaseInvoice } from "@/lib/purchase-invoices.functions";

export const Route = createFileRoute("/_authenticated/aankoopfacturen")({
  head: () => ({ meta: [{ title: "Aankoopfacturen — Riory Werkbonnen" }, { name: "description", content: "Inkomende facturen inlezen, controleren en in bulk betalen op de vervaldag." }, { property: "og:title", content: "Aankoopfacturen — Riory Werkbonnen" }, { property: "og:description", content: "Inkomende facturen inlezen, controleren en in bulk betalen op de vervaldag." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Aankoopfacturen,
});

type Row = {
  id: string; supplier_name: string; supplier_vat: string | null; supplier_iban: string | null;
  invoice_number: string | null; invoice_date: string | null; due_date: string | null;
  lines: PurchaseLine[]; net: number; vat: number; total: number; payment_ref: string | null;
  status: string; pdf_path: string | null; created_at: string;
};

const STATUS: Record<string, string> = { te_controleren: "Te controleren", goedgekeurd: "Goedgekeurd", betaald: "Betaald" };
const d = (s: string | null) => (s ? new Date(`${s}T12:00:00Z`).toLocaleDateString("nl-BE") : "—");

function Aankoopfacturen() {
  const qc = useQueryClient();
  const doImport = useServerFn(importPurchaseInvoices);
  const update = useServerFn(updatePurchaseInvoice);
  const setStatus = useServerFn(setPurchaseInvoiceStatus);
  const payFile = useServerFn(paymentFile);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  const [edit, setEdit] = useState<Row | null>(null);

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
    const chosen = rows.filter((r) => sel.includes(r.id) && r.status === "goedgekeurd");
    if (!chosen.length) { toast.error("Selecteer goedgekeurde facturen"); return; }
    if (!confirm(`Betaalbestand maken voor ${chosen.length} facturen (${euro(chosen.reduce((s, r) => s + Number(r.total), 0))})? Elke factuur wordt op zijn vervaldag betaald. Laad het bestand daarna in je banktoepassing.`)) return;
    setBusy(true);
    try {
      const r = await payFile({ data: { ids: chosen.map((x) => x.id) } });
      const url = URL.createObjectURL(new Blob([r.xml], { type: "application/xml" }));
      const a = document.createElement("a");
      a.href = url; a.download = r.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success("Betaalbestand gedownload en facturen als betaald gemarkeerd");
      setSel([]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Betaalbestand mislukt"); }
    setBusy(false);
    refresh();
  }

  async function bekijkPdf(path: string) {
    const { data, error } = await supabase.storage.from("aankoopfacturen").createSignedUrl(path, 300);
    if (error || !data?.signedUrl) { toast.error("PDF openen mislukt"); return; }
    window.open(data.signedUrl, "_blank");
  }

  async function slaOp() {
    if (!edit) return;
    setBusy(true);
    try {
      await update({
        data: {
          id: edit.id, supplierName: edit.supplier_name, supplierVat: edit.supplier_vat, supplierIban: edit.supplier_iban,
          invoiceNumber: edit.invoice_number, invoiceDate: edit.invoice_date, dueDate: edit.due_date,
          lines: edit.lines, net: Number(edit.net), vat: Number(edit.vat), total: Number(edit.total), paymentRef: edit.payment_ref,
        },
      });
      toast.success("Opgeslagen");
      setEdit(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Opslaan mislukt"); }
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
          <Button variant="outline" disabled={busy} onClick={importeer}>{busy ? "Bezig…" : "Nu inlezen vanuit mail"}</Button>
          <Button variant="outline" disabled={!sel.length || busy} onClick={() => markeer("goedgekeurd")}>Goedkeuren ({sel.length})</Button>
          <Button disabled={!sel.length || busy} onClick={betaal}>Betaalbestand maken</Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Mail of scan facturen naar info@riory.be en sleep ze in de map <strong>Aankoopfacturen</strong> — de app leest ze elk uur automatisch in. Controleer de uitgelezen bedragen, keur goed en maak één betaalbestand dat elke factuur op zijn vervaldag betaalt.
      </p>

      <ul className="divide-y rounded-md border bg-card">
        {rows.length === 0 && <li className="p-4 text-muted-foreground">Nog geen aankoopfacturen.</li>}
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
            <input type="checkbox" aria-label={`Selecteer factuur ${r.invoice_number ?? r.supplier_name}`} className="h-5 w-5 accent-primary" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} />
            <span className="font-bold">{r.supplier_name}</span>
            <span className="font-mono text-sm">{r.invoice_number ?? "—"}</span>
            <span className="text-sm text-muted-foreground">vervaldag {d(r.due_date)}</span>
            <span className="ml-auto font-mono">{euro(Number(r.total))}</span>
            <span className={`rounded px-2 py-0.5 text-xs font-bold ${r.status === "betaald" ? "bg-accent text-accent-foreground" : r.status === "goedgekeurd" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
              {STATUS[r.status] ?? r.status}
            </span>
            {r.pdf_path && <Button variant="outline" size="sm" onClick={() => bekijkPdf(r.pdf_path!)}>PDF</Button>}
            {r.status !== "betaald" && <Button variant="outline" size="sm" onClick={() => setEdit({ ...r, lines: (r.lines ?? []) as PurchaseLine[] })}>Controleren</Button>}
          </li>
        ))}
      </ul>

      {edit && (
        <section className="space-y-3 rounded-md border bg-card p-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black uppercase">Controleren: {edit.supplier_name}</h2>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => setEdit(null)}>Sluiten</Button>
          </div>
          {warnings.length > 0 && (
            <ul className="space-y-1 rounded-md border border-destructive bg-destructive/10 p-3 text-sm">
              {warnings.map((w) => <li key={w}>⚠ {w}</li>)}
            </ul>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
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
            <Button disabled={busy} onClick={slaOp}>Opslaan</Button>
            <Button variant="outline" disabled={busy} onClick={async () => { await slaOp(); await setStatus({ data: { ids: [edit.id], status: "goedgekeurd" } }); toast.success("Goedgekeurd"); refresh(); }}>Opslaan en goedkeuren</Button>
          </div>
        </section>
      )}
    </div>
  );
}
