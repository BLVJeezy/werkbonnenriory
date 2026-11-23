import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { fetchWachtrekeningDocuments, listInvoiceDownloadIds, type FetchedWachtrekeningDoc } from "@/lib/wachtrekening.functions";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const yearStart = (y: number) => `${y}-01-01`;
const yearEnd = (y: number) => `${y}-12-31`;
const monthStartAgo = (n: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return iso(d); };
const nl = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

const BATCH = 15;

/** Download every sales and purchase invoice of one period as one ZIP (PDFs + Excel overview). */
export function InvoiceDownload() {
  const year = new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(yearStart(year));
  const [to, setTo] = useState(yearEnd(year));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const listIds = useServerFn(listInvoiceDownloadIds);
  const fetchDocs = useServerFn(fetchWachtrekeningDocuments);

  async function download() {
    setBusy(true);
    setProgress("Facturen opzoeken…");
    try {
      const { salesIds, purchaseIds } = await listIds({ data: { from, to } });
      const total = salesIds.length + purchaseIds.length;
      if (!total) {
        toast.error(`Geen facturen tussen ${nl(from)} en ${nl(to)}`);
        return;
      }

      const docs: FetchedWachtrekeningDoc[] = [];
      let missing = 0;
      let done = 0;
      const chunks: { purchaseIds: string[]; salesIds: string[] }[] = [];
      for (let i = 0; i < salesIds.length; i += BATCH) chunks.push({ salesIds: salesIds.slice(i, i + BATCH), purchaseIds: [] });
      for (let i = 0; i < purchaseIds.length; i += BATCH) chunks.push({ salesIds: [], purchaseIds: purchaseIds.slice(i, i + BATCH) });
      for (const chunk of chunks) {
        const r = await fetchDocs({ data: chunk });
        docs.push(...r.docs);
        missing += r.missingCount;
        done += chunk.salesIds.length + chunk.purchaseIds.length;
        setProgress(`Facturen ophalen… ${Math.min(done, total)}/${total}`);
      }

      setProgress("ZIP-bestand samenstellen…");
      const zip = new JSZip();
      const usedNames = new Set<string>();
      const rows: Record<string, unknown>[] = [];
      for (const d of docs) {
        let name = d.fileName;
        let n = 2;
        while (usedNames.has(name)) {
          name = `${d.fileName.replace(/(\.[^.]+)$/, "")}-${n++}${d.fileName.match(/\.[^.]+$/)?.[0] ?? ".pdf"}`;
        }
        usedNames.add(name);
        const folder = d.type === "sales" ? "verkoop" : "aankoop";
        zip.file(`${folder}/${name}`, base64ToUint8Array(d.base64));
        rows.push({
          Type: d.type === "sales" ? "Verkoopfactuur" : "Aankoopfactuur",
          Nummer: d.number ?? "",
          Relatie: d.party ?? "",
          Datum: d.date ?? "",
          Totaal: d.total ?? "",
          Bestand: `${folder}/${name}`,
        });
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Overzicht");
      zip.file(`overzicht-${from}-tot-${to}.xlsx`, XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);

      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      downloadBlob(blob, `facturen-${from}-tot-${to}.zip`);
      toast.success(
        missing > 0
          ? `${docs.length} facturen gedownload (${missing} zonder PDF in het systeem)`
          : `${docs.length} facturen gedownload als ZIP`,
      );
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Downloaden mislukt");
    } finally {
      setBusy(false);
      setProgress("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
      <DialogTrigger asChild><Button variant="outline" size="sm">Alle facturen downloaden</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Alle facturen downloaden</DialogTitle>
          <DialogDescription>
            Alle verkoop- en aankoopfacturen van de gekozen periode als één ZIP-bestand, met de PDF’s in de mappen verkoop en aankoop plus een Excel-overzicht.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs"><span className="font-semibold">Van</span><Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="space-y-1 text-xs"><span className="font-semibold">Tot</span><Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button variant="outline" size="sm" onClick={() => { setFrom(yearStart(year)); setTo(yearEnd(year)); }}>Boekjaar {year}</Button>
          <Button variant="outline" size="sm" onClick={() => { setFrom(yearStart(year - 1)); setTo(yearEnd(year - 1)); }}>Boekjaar {year - 1}</Button>
          <Button variant="outline" size="sm" onClick={() => { setFrom(monthStartAgo(2)); setTo(iso(new Date())); }}>Laatste 3 maanden</Button>
        </div>
        {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
        <DialogFooter>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setOpen(false)}>Sluiten</Button>
          <Button size="sm" disabled={busy || from > to} onClick={download}>{busy ? "Bezig…" : "Downloaden"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
