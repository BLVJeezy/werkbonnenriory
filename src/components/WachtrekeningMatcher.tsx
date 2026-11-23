import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Download, FileArchive, FileCheck2, Landmark, HelpCircle, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import JSZip from "jszip";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { fetchWachtrekeningDocuments, parseWachtrekening } from "@/lib/wachtrekening.functions";
import {
  matchWachtrekeningLines,
  type BankTxCandidate,
  type PurchaseDocCandidate,
  type SalesDocCandidate,
  type WachtrekeningMatchResult,
} from "@/lib/wachtrekening-match";

const eur = (n: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(n);
const db = supabase as any;

type FilterStatus = "all" | "document_found" | "bank_only" | "unmatched";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result ?? "");
      const idx = res.indexOf(",");
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    reader.onerror = () => reject(new Error("Bestand lezen mislukt"));
    reader.readAsDataURL(file);
  });
}

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

export function WachtrekeningMatcher({ c }: { c: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const runParse = useServerFn(parseWachtrekening);
  const runFetchDocs = useServerFn(fetchWachtrekeningDocuments);
  const [busy, setBusy] = useState(false);
  const [zipBusy, setZipBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [accountInfo, setAccountInfo] = useState<string | null>(null);
  const [results, setResults] = useState<WachtrekeningMatchResult[]>([]);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<FilterStatus>("all");

  async function handleFile(file: File) {
    setBusy(true);
    setFileName(file.name);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      let parsed: { accountInfo: string | null; lines: WachtrekeningMatchResult["line"][] };

      if (ext === "xlsx" || ext === "xls" || ext === "csv") {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const textParts = wb.SheetNames.map((name) => {
          const sheet = wb.Sheets[name];
          return sheet ? `--- ${name} ---\n${XLSX.utils.sheet_to_csv(sheet, { FS: "\t" })}` : "";
        }).filter(Boolean);
        const textContent = textParts.join("\n\n").slice(0, 240_000);
        parsed = await runParse({ data: { kind: "text", fileName: file.name, textContent } });
      } else {
        const mime =
          file.type ||
          (ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg");
        const base64 = await fileToBase64(file);
        parsed = await runParse({ data: { kind: "media", fileName: file.name, mime, base64 } });
      }

      if (!parsed.lines.length) {
        toast.error("Geen boekingsregels gevonden in dit bestand");
        setResults([]);
        setAccountInfo(parsed.accountInfo);
        return;
      }

      const [bankRows, purchaseRows, salesRows] = await Promise.all([
        fetchAll<BankTxCandidate>((from, to) =>
          db
            .from("fin_bank_tx")
            .select("id,tx_date,amount,counterparty,counterparty_account,description,matched_invoice_id,matched_purchase_invoice_id,entry_id")
            .eq("company_id", c)
            .order("id")
            .range(from, to),
        ),
        fetchAll<PurchaseDocCandidate>((from, to) =>
          db
            .from("purchase_invoices")
            .select("id,invoice_number,supplier_name,invoice_date,total,status,payment_ref,kind")
            .order("id")
            .range(from, to),
        ),
        fetchAll<any>((from, to) =>
          db
            .from("invoices")
            .select("id,number,customer,issue_date,total,paid_amount,status,kind")
            .order("id")
            .range(from, to),
        ),
      ]);

      const salesCandidates: SalesDocCandidate[] = salesRows.map((s) => ({
        id: s.id,
        number: s.number ?? "",
        customer_name: (s.customer?.name as string) ?? "",
        issue_date: s.issue_date ?? "",
        total: Number(s.total ?? 0),
        paid_amount: Number(s.paid_amount ?? 0),
        status: s.status ?? "",
        kind: s.kind ?? "invoice",
      }));

      const matched = matchWachtrekeningLines(parsed.lines, bankRows, purchaseRows, salesCandidates);
      setAccountInfo(parsed.accountInfo);
      setResults(matched);
      setFeedback({});
      setFilter("all");
      const docCount = matched.filter((r) => r.status === "document_found").length;
      toast.success(`${matched.length} regel(s) gecontroleerd: ${docCount} met document gevonden`);
    } catch (err) {
      toast.error((err as Error).message || "Wachtrekening verwerken mislukt");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const counts = useMemo(() => {
    const doc = results.filter((r) => r.status === "document_found").length;
    const bank = results.filter((r) => r.status === "bank_only").length;
    const none = results.filter((r) => r.status === "unmatched").length;
    return { all: results.length, doc, bank, none };
  }, [results]);

  const visible = useMemo(
    () => (filter === "all" ? results : results.filter((r) => r.status === filter)),
    [results, filter],
  );

  function buildExportRows(docFileByKey?: Map<string, string>) {
    return results.map((r) => {
      const docKey = r.document ? `${r.document.type}:${r.document.id}` : "";
      return {
        Datum: r.line.date ?? "",
        Bedrag: r.line.amount,
        Tegenpartij_wachtrekening: r.line.counterparty,
        Omschrijving_wachtrekening: r.line.description,
        Status:
          r.status === "document_found"
            ? "Document gevonden"
            : r.status === "bank_only"
              ? "Alleen bankverrichting"
              : "Niet gevonden",
        Bank_datum: r.bankTx?.tx_date ?? "",
        Bank_tegenpartij: r.bankTx?.counterparty ?? "",
        Bank_IBAN: r.bankTx?.counterparty_account ?? "",
        Bank_mededeling: r.bankTx?.description ?? "",
        Document_type: r.document ? (r.document.type === "purchase" ? "Aankoopfactuur" : "Verkoopfactuur") : "",
        Document_nummer: r.document?.number ?? "",
        Document_relatie: r.document?.party ?? "",
        Document_bedrag: r.document?.total ?? "",
        Bijlage_in_ZIP: docKey ? (docFileByKey?.get(docKey) ?? "") : "",
        Feedback_boekhouder: feedback[r.line.id]?.trim() ?? "",
        Reden: r.document?.reason ?? r.bankReason ?? "",
      };
    });
  }

  function exportExcel() {
    const rows = buildExportRows();
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Wachtrekening");
    XLSX.writeFile(wb, `wachtrekening-controle-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function exportAccountantZip() {
    setZipBusy(true);
    try {
      const purchaseIds = results.filter((r) => r.document?.type === "purchase").map((r) => r.document!.id);
      const salesIds = results.filter((r) => r.document?.type === "sales").map((r) => r.document!.id);
      const { docs, missingCount } = await runFetchDocs({ data: { purchaseIds, salesIds } });

      const zip = new JSZip();
      const docFileByKey = new Map<string, string>();
      const usedNames = new Set<string>();

      for (const d of docs) {
        let name = d.fileName;
        let n = 2;
        while (usedNames.has(name)) {
          name = `${d.fileName.replace(/(\.[^.]+)$/, "")}-${n++}${d.fileName.match(/\.[^.]+$/)?.[0] ?? ".pdf"}`;
        }
        usedNames.add(name);
        docFileByKey.set(`${d.type}:${d.id}`, `facturen/${name}`);
        zip.file(`facturen/${name}`, base64ToUint8Array(d.base64));
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      const ws = XLSX.utils.json_to_sheet(buildExportRows(docFileByKey));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Wachtrekening");
      const xlsxBytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
      zip.file(`wachtrekening-afgewerkt-${todayStr}.xlsx`, xlsxBytes);

      const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
      downloadBlob(blob, `wachtrekening-boekhouder-${todayStr}.zip`);
      toast.success(
        missingCount > 0
          ? `Pakket gedownload met ${docs.length} factuur/facturen (${missingCount} zonder PDF)`
          : `Pakket gedownload met overzicht en ${docs.length} gekoppelde factuur/facturen`,
      );
    } catch (err) {
      toast.error((err as Error).message || "Pakket voor boekhouder maken mislukt");
    } finally {
      setZipBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Wachtrekening uploaden en uitzoeken</p>
            <p className="text-xs text-muted-foreground">
              Upload een overzicht van je boekhouder (PDF, Excel, CSV of afbeelding). Het systeem zoekt per betaling de
              bankverrichting én een passend aankoop- of verkoopdocument op.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Upload className="mr-1.5 size-4" />}
              {busy ? "Bezig met uitlezen…" : "Wachtrekening uploaden"}
            </Button>
            {results.length > 0 && (
              <>
                <Button size="sm" variant="default" disabled={zipBusy} onClick={exportAccountantZip}>
                  {zipBusy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <FileArchive className="mr-1.5 size-4" />}
                  {zipBusy ? "Pakket maken…" : "Pakket voor boekhouder (ZIP)"}
                </Button>
                <Button size="sm" variant="outline" onClick={exportExcel}>
                  <Download className="mr-1.5 size-4" />
                  Alleen Excel
                </Button>
              </>
            )}
          </div>
        </div>
        {fileName && (
          <p className="text-xs text-muted-foreground">
            Bestand: <span className="font-medium text-foreground">{fileName}</span>
            {accountInfo ? ` · ${accountInfo}` : ""}
          </p>
        )}
      </div>

      {results.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
              Alles ({counts.all})
            </Button>
            <Button size="sm" variant={filter === "document_found" ? "default" : "outline"} onClick={() => setFilter("document_found")}>
              <FileCheck2 className="mr-1 size-3.5" />
              Document gevonden ({counts.doc})
            </Button>
            <Button size="sm" variant={filter === "bank_only" ? "default" : "outline"} onClick={() => setFilter("bank_only")}>
              <Landmark className="mr-1 size-3.5" />
              Alleen bank ({counts.bank})
            </Button>
            <Button size="sm" variant={filter === "unmatched" ? "default" : "outline"} onClick={() => setFilter("unmatched")}>
              <HelpCircle className="mr-1 size-3.5" />
              Niet gevonden ({counts.none})
            </Button>
          </div>

          <div className="space-y-2">
            {visible.map((r) => (
              <div key={r.line.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{r.line.date ?? "Geen datum"}</span>
                      <span className="font-semibold text-sm">{r.line.counterparty || "Zonder tegenpartij"}</span>
                      {r.status === "document_found" && <Badge variant="default">Document gevonden</Badge>}
                      {r.status === "bank_only" && <Badge variant="secondary">Alleen bankverrichting</Badge>}
                      {r.status === "unmatched" && <Badge variant="destructive">Niet gevonden</Badge>}
                    </div>
                    {(r.line.description || r.line.reference) && (
                      <p className="text-xs text-muted-foreground break-words">
                        {[r.line.description, r.line.reference].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <span className="font-mono text-sm font-semibold whitespace-nowrap">{eur(r.line.amount)}</span>
                </div>

                <div className="grid gap-2 border-t border-border pt-2 text-xs md:grid-cols-2">
                  <div>
                    <p className="font-medium text-muted-foreground">Waar de betaling naartoe ging (Bank)</p>
                    {r.bankTx ? (
                      <div className="mt-0.5 space-y-0.5">
                        <p className="font-medium text-foreground">
                          {r.bankTx.counterparty || "Onbekende tegenpartij"}{" "}
                          <span className="font-mono text-muted-foreground">({r.bankTx.tx_date})</span>
                        </p>
                        {r.bankTx.counterparty_account && (
                          <p className="font-mono text-muted-foreground">{r.bankTx.counterparty_account}</p>
                        )}
                        {r.bankTx.description && <p className="text-muted-foreground break-words">{r.bankTx.description}</p>}
                        {r.bankReason && <p className="text-muted-foreground">{r.bankReason}</p>}
                      </div>
                    ) : (
                      <p className="mt-0.5 text-muted-foreground">Geen overeenkomende bankverrichting gevonden.</p>
                    )}
                  </div>

                  <div>
                    <p className="font-medium text-muted-foreground">Document om te koppelen</p>
                    {r.document ? (
                      <div className="mt-0.5 space-y-1">
                        <p className="font-medium text-foreground">
                          {r.document.type === "purchase" ? "Aankoopfactuur" : "Verkoopfactuur"} {r.document.number} ·{" "}
                          {r.document.party} ({eur(r.document.total)})
                        </p>
                        <p className="text-muted-foreground">{r.document.reason}</p>
                        {r.document.type === "purchase" ? (
                          <Link
                            to="/aankoopfacturen/$id"
                            params={{ id: r.document.id }}
                            className="inline-flex items-center gap-1 text-primary underline"
                          >
                            Aankoopfactuur openen <ExternalLink className="size-3" />
                          </Link>
                        ) : (
                          <Link to="/facturen" className="inline-flex items-center gap-1 text-primary underline">
                            Naar verkoopfacturen <ExternalLink className="size-3" />
                          </Link>
                        )}
                      </div>
                    ) : (
                      <div className="mt-0.5 space-y-1.5">
                        <p className="text-muted-foreground">Geen passend document in de app gevonden.</p>
                        <Input
                          value={feedback[r.line.id] ?? ""}
                          onChange={(e) => setFeedback((prev) => ({ ...prev, [r.line.id]: e.target.value }))}
                          placeholder="Jouw feedback voor de boekhouder (bv. privé-uitgave, bonnetje volgt…)"
                          className="h-8 text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}