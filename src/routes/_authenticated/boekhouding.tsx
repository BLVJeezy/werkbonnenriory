import { CardFeeReport } from "@/components/CardFeeReport";
import { SAVINGS_ACCOUNT, markSavingsQuarterDone } from "@/lib/savings-quarter";
import { cardGross } from "@/lib/card-gross";
import { parseCoda } from "@/lib/coda";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PontoConnection } from "@/components/PontoConnection";
import { useFinanceAuth as useAuth } from "@/lib/finance-auth";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { dedupeKey, isPrivateCompany, parseAmount } from "@/lib/finance";
import { MAR } from "@/lib/mar";
import { undoEntry } from "@/lib/undo";
import { pontoAccounts, pontoSync } from "@/lib/finance-ponto.functions";
import { useFinanceSales } from "@/lib/use-finance-sales";
import { useServerFn } from "@tanstack/react-start";
import {
  accountClass, controlAccounts, invoiceToEntry, isBalanced, openingEntry, parseAccountRows, paymentEntry, r2, statements, trialBalance, vatReport,
  type ImportedAccount, type JLine, type PostedLine,
} from "@/lib/boekhouding";

export const Route = createFileRoute("/_authenticated/boekhouding")({
  head: () => ({
    meta: [
      { title: "Boekhouding — Riory Werkbonnen" },
      { name: "description", content: "Opvolgboekhouding: rekeningschema, dagboeken, saldibalans, balans, resultaat, btw en bank." },
      { property: "og:title", content: "Boekhouding — Riory Werkbonnen" },
      { property: "og:description", content: "Opvolgboekhouding per bedrijf." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({ tab: (s["tab"] as string) || "rekeningen" }),
  component: Boekhouding,
});

const TABS = [["rekeningen", "Rekeningschema"], ["dagboeken", "Dagboeken"], ["saldibalans", "Saldibalans"], ["balans", "Balans & resultaat"], ["btw", "Btw"], ["bank", "Bank"]] as const;
const eur = (n: number) => new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(n);
const db = supabase as any;
const yearStart = () => `${new Date().getFullYear()}-01-01`;
const today = () => new Date().toISOString().slice(0, 10);

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-card p-4"><p className="mb-2 text-sm font-semibold">{title}</p>{children}</div>;
}

function Boekhouding() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const search = Route.useSearch();
  const [c, setC] = useState("");
  useEffect(() => { if (!loading && !user) nav({ to: "/werkbonnen" }); }, [loading, user, nav]);
  const companies = useQuery({ queryKey: ["fin-companies"], enabled: !!user, queryFn: async () => ((await supabase.from("companies").select("*").order("name")).data ?? []).filter((x) => !isPrivateCompany(x.name)) });
  useEffect(() => { if (!c && companies.data?.length) setC(companies.data[0]?.id ?? ""); }, [companies.data, c]);
  const qcRoot = useQueryClient();
  useEffect(() => { if (c) postDueRecurring(c).then((n) => { if (n) { toast.success(`${n} vaste boeking(en) automatisch geboekt`); qcRoot.invalidateQueries({ queryKey: ["fin"] }); } }).catch(() => {}); }, [c, qcRoot]);
  useEffect(() => { if (c) postDueLoans(c).then((n) => { if (n) { toast.success(`${n} kredietboeking(en) automatisch geboekt`); qcRoot.invalidateQueries({ queryKey: ["fin"] }); } }).catch(() => {}); }, [c, qcRoot]);
  useFinanceSales(!!user && companies.data?.find((x) => x.id === c)?.name.trim().toLowerCase() === "riory bv");
  if (loading) return <p className="text-sm text-muted-foreground">Laden…</p>;
  if (!user) return <p className="text-sm text-destructive">Alleen voor beheerder.</p>;
  return (
    <div className="min-w-0 bg-background text-foreground">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Link to="/finance" search={{ tab: "overzicht", id: undefined, maand: undefined }}><Button variant="outline" size="sm"><ArrowLeft className="mr-1 size-4" />Finance</Button></Link>
          <h1 className="text-xl font-bold">Boekhouding</h1>
          <select className="rounded-md border border-border bg-card px-2 py-1 text-sm" value={c} onChange={(e) => setC(e.target.value)}>
            {companies.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </div>
        <p className="text-xs text-muted-foreground print:hidden">Opvolgboekhouding: houdt je cijfers bij en is exporteerbaar voor je boekhouder. De officiële boekhouding en btw-aangifte blijven bij je boekhouder.</p>
        <div className="flex gap-1 overflow-x-auto pb-1 print:hidden">
          {TABS.map(([k, l]) => <Button key={k} size="sm" variant={search.tab === k ? "default" : "outline"} onClick={() => nav({ to: "/boekhouding", search: { tab: k } })}>{l}</Button>)}
        </div>
        {c && (
          <>
            {search.tab === "rekeningen" && <Rekeningen c={c} />}
            {search.tab === "dagboeken" && <Dagboeken c={c} />}
            {search.tab === "saldibalans" && <Saldibalans c={c} />}
            {search.tab === "balans" && <Balans c={c} companyName={companies.data?.find((x) => x.id === c)?.name ?? ""} />}
            {search.tab === "btw" && <Btw c={c} />}
            {search.tab === "bank" && <Bank c={c} />}
          </>
        )}
      </div>
    </div>
  );
}

export function useAccounts(c: string) {
  return useQuery({ queryKey: ["fin", "accounts", c], queryFn: async () => (await fetchAll((a, b) => db.from("fin_accounts").select("*").eq("company_id", c).order("number").range(a, b))) as any[] });
}
function usePosted(c: string) {
  return useQuery({
    queryKey: ["fin", "posted", c],
    queryFn: async () => {
      const rows = (await fetchAll((a, b) => db.from("fin_journal_lines").select("*, fin_journal_entries!inner(entry_date, journal, description, reference, source)").eq("company_id", c).range(a, b))) as any[];
      return rows.map((r) => ({ ...r, debit: Number(r.debit), credit: Number(r.credit), entry_date: r.fin_journal_entries.entry_date, journal: r.fin_journal_entries.journal })) as (PostedLine & { entry_id: string; fin_journal_entries: any })[];
    },
  });
}
const post = async (c: string, journal: string, date: string, description: string, reference: string | null, source: string, source_ref: string | null, lines: JLine[]) => {
  const { data, error } = await db.rpc("fin_post_entry", { _company: c, _journal: journal, _date: date, _description: description, _reference: reference, _source: source, _source_ref: source_ref, _lines: lines });
  if (error) throw new Error(error.message);
  return data as string;
};
const AccountList = ({ accounts }: { accounts: any[] }) => <datalist id="fin-accounts">{accounts.map((a) => <option key={a.id} value={a.number}>{a.name}</option>)}</datalist>;

// Kredieten: aflossing wordt pas geboekt als de bijhorende bankbetaling (exact bedrag, ±7 dagen) er is;
// herklassering lange → korte termijn op 31/12. Uniek via source "lening" + "<lening>:YYYY-MM" / "<lening>:herkl:YYYY".
async function postDueLoans(c: string): Promise<number> {
  const now = today();
  const { data: rows } = await db.from("fin_loan_schedule").select("*").eq("company_id", c).lte("due_date", now).order("due_date");
  if (!rows?.length) return 0;
  const { data: done } = await db.from("fin_journal_entries").select("source_ref").eq("company_id", c).eq("source", "lening");
  const have = new Set((done ?? []).map((r: any) => r.source_ref));
  const { data: bank } = await db.from("fin_bank_tx").select("id, tx_date, amount, bank_account").eq("company_id", c).is("entry_id", null).lt("amount", 0).gte("tx_date", rows[0]?.due_date ?? "");
  const free = [...(bank ?? [])];
  const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
  let n = 0;
  for (const r of rows as any[]) {
    const cap = Number(r.capital), int = Number(r.interest);
    if (r.kind === "herklassering") {
      const ref = `${r.loan_key}:herkl:${r.due_date.slice(0, 4)}`;
      if (have.has(ref)) continue;
      try { await post(c, "divers", r.due_date, `Herklassering krediet ${r.loan_name} naar korte termijn`, r.reference, "lening", ref, [{ account: r.debit_account, debit: cap, credit: 0 }, { account: r.credit_account, debit: 0, credit: cap }]); n++; } catch { /* rekening ontbreekt */ }
      continue;
    }
    const ref = `${r.loan_key}:${r.due_date.slice(0, 7)}`;
    if (have.has(ref)) continue;
    const total = Math.round((cap + int) * 100) / 100;
    const lo = addDays(r.due_date, -7), hi = addDays(r.due_date, 3);
    const i = free.findIndex((t: any) => Math.abs(Number(t.amount) + total) < 0.005 && t.tx_date >= lo && t.tx_date <= hi);
    if (i < 0) continue; // nog niet betaald of nog niet uit de bank opgehaald
    const tx: any = free.splice(i, 1)[0];
    const bankAcc = tx.bank_account || r.credit_account || "550200";
    try {
      const id = await post(c, "bank", tx.tx_date, `Aflossing krediet ${r.loan_name} ${r.due_date.slice(5, 7)}/${r.due_date.slice(0, 4)}`, r.reference, "lening", ref, [
        { account: r.debit_account, debit: cap, credit: 0, description: "Kapitaal" },
        { account: "650010", debit: int, credit: 0, description: "Intrest" },
        { account: bankAcc, debit: 0, credit: total, description: "Betaling" },
      ]);
      await db.from("fin_bank_tx").update({ entry_id: id }).eq("id", tx.id);
      n++;
    } catch { /* overslaan */ }
  }
  return n;
}

// Vaste maandelijkse boekingen: boekt elke vervallen maand precies één keer (uniek op recurring-id:YYYY-MM).
async function postDueRecurring(c: string): Promise<number> {
  const { data: rules } = await db.from("fin_recurring").select("*").eq("company_id", c).eq("active", true);
  if (!rules?.length) return 0;
  const { data: done } = await db.from("fin_journal_entries").select("source_ref").eq("company_id", c).eq("source", "vast");
  const have = new Set((done ?? []).map((r: any) => r.source_ref));
  const now = today();
  let n = 0;
  for (const r of rules as any[]) {
    let [y, mo] = r.start_month.slice(0, 7).split("-").map(Number);
    for (let guard = 0; guard < 600; guard++) {
      const ym = `${y}-${String(mo).padStart(2, "0")}`;
      if (r.end_month && ym > r.end_month.slice(0, 7)) break;
      const date = `${ym}-${String(r.day_of_month).padStart(2, "0")}`;
      if (date > now) break;
      const ref = `${r.id}:${ym}`;
      if (!have.has(ref)) {
        const amt = Number(r.amount);
        try { await post(c, r.journal, date, `${r.description} ${ym}`, null, "vast", ref, [{ account: r.debit_account, debit: amt, credit: 0 }, { account: r.credit_account, debit: 0, credit: amt }]); n++; } catch { /* al geboekt of ongeldige rekening */ }
      }
      mo++; if (mo > 12) { mo = 1; y++; }
    }
  }
  return n;
}

function VasteBoekingen({ c, onChange }: { c: string; onChange: () => void }) {
  const qc = useQueryClient();
  const { data: rules = [] } = useQuery({ queryKey: ["fin", "recurring", c], queryFn: async () => (await db.from("fin_recurring").select("*").eq("company_id", c).order("created_at")).data ?? [] });
  const [f, setF] = useState({ description: "Huur", amount: "", debit: "611120", credit: "550000", start: "2026-09", day: "1" });
  const add = async () => {
    const amount = parseAmount(f.amount);
    if (!amount || amount <= 0) { toast.error("Vul een bedrag in"); return; }
    const { error } = await db.from("fin_recurring").insert({ company_id: c, description: f.description, amount, debit_account: f.debit, credit_account: f.credit, start_month: `${f.start}-01`, day_of_month: Math.min(28, Math.max(1, Number(f.day) || 1)) });
    if (error) { toast.error(error.message); return; }
    const n = await postDueRecurring(c);
    toast.success(`Vaste boeking toegevoegd${n ? `, ${n} maand(en) al geboekt` : ""}`);
    qc.invalidateQueries({ queryKey: ["fin"] }); onChange();
  };
  return (
    <Card title="Vaste maandelijkse boekingen (automatisch)">
      <p className="text-xs text-muted-foreground">Bv. huur zonder factuur of btw. Elke maand wordt automatisch één boeking gemaakt zodra de dag bereikt is (bij het openen van Boekhouding).</p>
      {rules.map((r: any) => (
        <div key={r.id} className="mt-1 flex items-center justify-between rounded border border-border p-1 text-xs">
          <span>{r.description} · {eur(Number(r.amount))} · {r.debit_account} / {r.credit_account} · vanaf {r.start_month.slice(0, 7)} op dag {r.day_of_month}{r.active ? "" : " (gestopt)"}</span>
          <Button variant="ghost" className="text-destructive" onClick={async () => { if (!confirm("Stoppen met deze vaste boeking? Reeds geboekte maanden blijven staan.")) return; await db.from("fin_recurring").update({ active: false, end_month: `${today().slice(0, 7)}-01` }).eq("id", r.id); qc.invalidateQueries({ queryKey: ["fin", "recurring", c] }); }}>{r.active ? "stoppen" : ""}</Button>
        </div>
      ))}
      <div className="mt-2 grid grid-cols-2 gap-1">
        <Input placeholder="Omschrijving" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <Input placeholder="Bedrag per maand" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
        <Input list="fin-accounts" placeholder="Debet (kost)" value={f.debit} onChange={(e) => setF({ ...f, debit: e.target.value })} />
        <Input list="fin-accounts" placeholder="Credit (bank)" value={f.credit} onChange={(e) => setF({ ...f, credit: e.target.value })} />
        <Input type="month" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        <Input type="number" min={1} max={28} placeholder="Dag" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />
      </div>
      <Button size="sm" className="mt-2" disabled={!f.description || !f.amount} onClick={add}>Toevoegen</Button>
    </Card>
  );
}

// ---------- Rekeningschema ----------
function Rekeningen({ c }: { c: string }) {
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts(c);
  const [q, setQ] = useState("");
  const [n, setN] = useState({ number: "", name: "" });
  const [imp, setImp] = useState<{ file: string; rows: Record<string, unknown>[]; cols: string[]; map: { nr: string; naam: string; saldo: string; debet: string; credit: string }; date: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["fin"] });
  const loadMar = async () => {
    const have = new Set(accounts.map((a) => a.number));
    const rows = MAR.filter(([nr]) => !have.has(nr)).map(([number, name]) => ({ company_id: c, number, name, source: "standaard" }));
    if (!rows.length) return void toast.info("Standaardschema staat er al volledig in");
    const { error } = await db.from("fin_accounts").insert(rows);
    error ? toast.error("Laden mislukt") : toast.success(`${rows.length} rekeningen toegevoegd`); refresh();
  };
  const onFile = async (f: File) => {
    const wb = XLSX.read(await f.arrayBuffer());
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0] ?? ""] ?? {}, { defval: "" });
    const cols = Object.keys(rows[0] ?? {});
    const find = (re: RegExp) => cols.find((k) => re.test(k.toLowerCase())) ?? "";
    setImp({ file: f.name, rows, cols, date: yearStart(), map: { nr: find(/rek|nr|nummer|account|code/), naam: find(/naam|omschr|name|label/), saldo: find(/saldo|balance/), debet: find(/debet|debit/), credit: find(/credit/) } });
  };
  const parsed: ImportedAccount[] = useMemo(() => imp ? parseAccountRows(imp.rows, { nr: imp.map.nr, naam: imp.map.naam, ...(imp.map.saldo ? { saldo: imp.map.saldo } : { ...(imp.map.debet ? { debet: imp.map.debet } : {}), ...(imp.map.credit ? { credit: imp.map.credit } : {}) }) }) : [], [imp]);
  const opening = useMemo(() => openingEntry(parsed), [parsed]);
  const doImport = async (withOpening: boolean) => {
    const ok = parsed.filter((p) => !p.err);
    const { error } = await db.from("fin_accounts").upsert(ok.map((p) => ({ company_id: c, number: p.number, name: p.name, source: `balans:${imp?.file ?? ""}` })), { onConflict: "company_id,number" });
    if (error) return void toast.error("Import mislukt");
    if (withOpening) {
      if (opening.diff !== 0) return void toast.error(`Openingsbalans sluit niet (verschil ${eur(opening.diff)}) — rekeningen wel geïmporteerd`);
      try { await post(c, "opening", imp?.date ?? "", `Openingsbalans uit ${imp?.file ?? ""}`, null, "opening", imp?.date ?? "", opening.lines); toast.success("Rekeningen en openingsbalans geboekt"); }
      catch (e: any) { toast.error(/duplicate|unique/i.test(e.message) ? "Er bestaat al een openingsbalans op die datum" : e.message); }
    } else toast.success(`${ok.length} rekeningen overgenomen`);
    setImp(null); refresh();
  };
  const shown = accounts.filter((a) => !q || a.number.startsWith(q) || a.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
      <div className="space-y-3">
        <Card title="Rekeningen toevoegen">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={loadMar}>Belgisch standaardschema laden</Button>
            <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm">Balans importeren (Excel/CSV)<input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Exporteer bij je boekhouder de proef- en saldibalans of het rekeningschema als Excel. Je eigen rekeningen vullen het standaardschema aan; bestaande nummers krijgen jouw naam.</p>
          <div className="mt-3 flex gap-2">
            <Input className="w-28" placeholder="Nummer" value={n.number} onChange={(e) => setN({ ...n, number: e.target.value })} />
            <Input placeholder="Naam" value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} />
            <Button size="sm" onClick={async () => { const { error } = await db.from("fin_accounts").insert({ company_id: c, ...n }); if (error) return void toast.error(/unique|duplicate/.test(error.message) ? "Nummer bestaat al" : "Ongeldig nummer of naam"); setN({ number: "", name: "" }); refresh(); }}>+</Button>
          </div>
        </Card>
        {imp && (
          <Card title={`Import ${imp.file} — ${parsed.length} rijen`}>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {(["nr", "naam", "saldo", "debet", "credit"] as const).map((k) => (
                <label key={k}>{k === "nr" ? "Rekening" : k === "naam" ? "Naam" : (k[0] ?? "").toUpperCase() + k.slice(1)}
                  <select className="w-full rounded border border-border bg-background p-1" value={imp.map[k]} onChange={(e) => setImp({ ...imp, map: { ...imp.map, [k]: e.target.value } })}><option value="">—</option>{imp.cols.map((x) => <option key={x}>{x}</option>)}</select>
                </label>
              ))}
              <label>Datum openingsbalans<Input type="date" value={imp.date} onChange={(e) => setImp({ ...imp, date: e.target.value })} /></label>
            </div>
            <div className="mt-2 max-h-48 overflow-y-auto text-xs">
              {parsed.slice(0, 200).map((p, i) => <div key={i} className={p.err ? "text-destructive" : ""}>{p.number} {p.name} {p.saldo != null ? eur(p.saldo) : ""} {p.err}</div>)}
            </div>
            <p className="mt-2 text-xs">{parsed.filter((p) => p.err).length} fout(en) worden overgeslagen. Openingsbalans: {opening.lines.length} balansrekeningen, verschil {eur(opening.diff)}.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => doImport(false)}>Enkel rekeningen</Button>
              <Button size="sm" variant="outline" disabled={!opening.lines.length || opening.diff !== 0} onClick={() => doImport(true)}>Rekeningen + openingsbalans boeken</Button>
              <Button size="sm" variant="ghost" onClick={() => setImp(null)}>Annuleren</Button>
            </div>
          </Card>
        )}
      </div>
      <Card title={`Rekeningschema (${accounts.length})`}>
        <Input placeholder="Zoek op nummer of naam" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="mt-2 max-h-[65dvh] overflow-y-auto text-sm">
          {shown.map((a) => (
            <div key={a.id} className="flex items-center gap-2 border-t border-border py-1">
              <span className="w-20 font-mono">{a.number}</span>
              <input className="flex-1 bg-transparent" defaultValue={a.name} onBlur={async (e) => { if (e.target.value !== a.name && e.target.value.trim()) { await db.from("fin_accounts").update({ name: e.target.value }).eq("id", a.id); refresh(); } }} />
              <span className="text-xs text-muted-foreground">{a.source === "standaard" ? "standaard" : a.source.startsWith("balans") ? "balans" : "eigen"}</span>
              <Button variant="ghost" className="text-destructive" onClick={async () => { const { error } = await db.from("fin_accounts").delete().eq("id", a.id); if (!error) refresh(); }}>×</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ---------- Dagboeken ----------
function Dagboeken({ c }: { c: string }) {
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts(c);
  const { data: posted = [] } = usePosted(c);
  const { data: inv = [] } = useQuery({ queryKey: ["fin", "inv-post", c], queryFn: async () => (await db.from("fin_invoices").select("*, fin_invoice_lines(*)").eq("company_id", c).eq("review_status", "goedgekeurd").order("invoice_date")).data ?? [] });
  const [journal, setJournal] = useState("alle");
  const [m, setM] = useState({ journal: "divers", date: today(), description: "", lines: [{ account: "", debit: "", credit: "" }, { account: "", debit: "", credit: "" }] });
  const { data: invRefs = [] } = useQuery({ queryKey: ["fin", "inv-refs", c, posted.length], queryFn: async () => ((await db.from("fin_journal_entries").select("source, source_ref").eq("company_id", c).in("source", ["factuur", "simpla"])).data ?? []).map((r: any) => `${r.source}:${r.source_ref}`) });
  // Een factuur is al geboekt via de facturenlijst (factuur:<id>) of rechtstreeks bij Simpla-sync (simpla:<simpla-id>) — nooit dubbel boeken.
  const todo = inv.filter((i: any) => !invRefs.includes(`factuur:${i.id}`) && !(i.source === "simpla" && i.source_ref && invRefs.includes(`simpla:${i.source_ref}`)) && i.invoice_date);
  const refresh = () => qc.invalidateQueries({ queryKey: ["fin"] });
  const postInvoices = async () => {
    let ok = 0; const errs: string[] = [];
    for (const i of todo) {
      const e = invoiceToEntry({ direction: i.direction, doc_type: i.doc_type, lines: i.fin_invoice_lines.map((l: any) => ({ account: l.account, ex_vat: Number(l.ex_vat), vat: Number(l.vat), is_investment: l.is_investment, description: l.description })) }, controlAccounts(accounts.map((a) => a.number)));
      if (e.error) { errs.push(`${i.counterparty ?? ""} ${i.number ?? ""}: ${e.error}`); continue; }
      try { await post(c, i.direction, i.invoice_date, `${i.doc_type === "creditnota" ? "Creditnota" : "Factuur"} ${i.counterparty ?? ""}`, i.number, "factuur", i.id, e.lines); ok++; }
      catch (x: any) { errs.push(`${i.counterparty ?? ""} ${i.number ?? ""}: ${x.message}`); }
    }
    toast[errs.length ? "warning" : "success"](`${ok} factuur/facturen geboekt${errs.length ? `, ${errs.length} niet: ${errs.slice(0, 3).join(" · ")}` : ""}`);
    refresh();
  };
  const ml: JLine[] = m.lines.filter((l) => l.account).map((l) => ({ account: l.account, debit: parseAmount(l.debit) ?? 0, credit: parseAmount(l.credit) ?? 0 }));
  const bal = isBalanced(ml);
  const entries = useMemo(() => {
    const g = new Map<string, { id: string; e: any; lines: PostedLine[] }>();
    for (const p of posted) { const x = g.get(p.entry_id) ?? { id: p.entry_id, e: p.fin_journal_entries, lines: [] }; x.lines.push(p); g.set(p.entry_id, x); }
    return [...g.values()].filter((x) => journal === "alle" || x.e.journal === journal).sort((a, b) => b.e.entry_date.localeCompare(a.e.entry_date));
  }, [posted, journal]);
  const name = (nr: string) => accounts.find((a) => a.number === nr)?.name ?? "";
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
      <AccountList accounts={accounts} />
      <div className="space-y-3">
        <Card title="Goedgekeurde facturen boeken">
          <p className="text-sm">{todo.length} goedgekeurde factuur/facturen nog niet in het aankoop- of verkoopdagboek.</p>
          <p className="text-xs text-muted-foreground">Aankoop: kostenrekening + 411000 btw aan leveranciers (je eigen 440-rekening). Verkoop: klanten aan omzet + 451000 btw. Creditnota's omgekeerd. Elke factuur wordt maar één keer geboekt.</p>
          <Button size="sm" className="mt-2" disabled={!todo.length} onClick={postInvoices}>Nu boeken</Button>
        </Card>
        <Card title="Manuele boeking (divers)">
          <div className="flex gap-2">
            <select className="rounded border border-border bg-background p-1 text-sm" value={m.journal} onChange={(e) => setM({ ...m, journal: e.target.value })}>{["divers", "bank", "aankoop", "verkoop"].map((j) => <option key={j}>{j}</option>)}</select>
            <Input type="date" value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} />
          </div>
          <Input className="mt-2" placeholder="Omschrijving" value={m.description} onChange={(e) => setM({ ...m, description: e.target.value })} />
          {m.lines.map((l, i) => (
            <div key={i} className="mt-1 grid grid-cols-3 gap-1">
              <Input list="fin-accounts" placeholder="Rekening" value={l.account} onChange={(e) => setM({ ...m, lines: m.lines.map((x, j) => j === i ? { ...x, account: e.target.value } : x) })} />
              <Input placeholder="Debet" value={l.debit} onChange={(e) => setM({ ...m, lines: m.lines.map((x, j) => j === i ? { ...x, debit: e.target.value } : x) })} />
              <Input placeholder="Credit" value={l.credit} onChange={(e) => setM({ ...m, lines: m.lines.map((x, j) => j === i ? { ...x, credit: e.target.value } : x) })} />
            </div>
          ))}
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setM({ ...m, lines: [...m.lines, { account: "", debit: "", credit: "" }] })}>+ lijn</Button>
            <span className={"text-xs " + (bal.ok ? "text-muted-foreground" : "text-destructive")}>D {eur(bal.debit)} / C {eur(bal.credit)}</span>
            <Button size="sm" disabled={!bal.ok || !m.description} onClick={async () => {
              try { await post(c, m.journal, m.date, m.description, null, "handmatig", null, ml); toast.success("Geboekt"); setM({ ...m, description: "", lines: [{ account: "", debit: "", credit: "" }, { account: "", debit: "", credit: "" }] }); refresh(); } catch (e: any) { toast.error(e.message); }
            }}>Boeken</Button>
          </div>
        </Card>
        <VasteBoekingen c={c} onChange={refresh} />
      </div>
      <Card title="Boekingen">
        <select className="mb-2 rounded border border-border bg-background p-1 text-sm" value={journal} onChange={(e) => setJournal(e.target.value)}>{["alle", "aankoop", "verkoop", "bank", "divers", "opening"].map((j) => <option key={j}>{j}</option>)}</select>
        <div className="max-h-[70dvh] space-y-2 overflow-y-auto text-xs">
          {entries.slice(0, 300).map((x) => (
            <div key={x.id} className="rounded border border-border p-2">
              <div className="flex justify-between"><span className="font-medium">{x.e.entry_date} · {x.e.journal} · {x.e.description}</span>
                <Button variant="ghost" className="rounded border border-border px-1.5 text-muted-foreground hover:text-destructive" onClick={async () => { if (!confirm("Deze boeking ongedaan maken? Een gekoppelde bankbetaling komt terug bij 'Te verwerken'.")) return; try { await undoEntry(c, x.id); toast.success("Boeking ongedaan gemaakt"); refresh(); } catch (e: any) { toast.error(e.message); } }}>Ongedaan maken</Button></div>
              {x.lines.map((l, i) => <div key={i} className="grid grid-cols-[4rem_1fr_5rem_5rem] gap-1"><span className="font-mono">{l.account}</span><span className="truncate">{name(l.account)}</span><span className="text-right">{l.debit ? eur(l.debit) : ""}</span><span className="text-right">{l.credit ? eur(l.credit) : ""}</span></div>)}
            </div>
          ))}
          {!entries.length && <p className="text-muted-foreground">Nog geen boekingen.</p>}
        </div>
      </Card>
    </div>
  );
}

function Period({ from, to, setFrom, setTo }: { from: string; to: string; setFrom: (s: string) => void; setTo: (s: string) => void }) {
  return <div className="flex flex-wrap gap-2 text-xs"><label>Van<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label>Tot<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>;
}
const exportXlsx = (name: string, rows: Record<string, unknown>[]) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Blad1"); XLSX.writeFile(wb, name); };

// ---------- Saldibalans ----------
function Saldibalans({ c }: { c: string }) {
  const { data: accounts = [] } = useAccounts(c);
  const { data: posted = [] } = usePosted(c);
  const [from, setFrom] = useState(yearStart()); const [to, setTo] = useState(today());
  const tb = trialBalance(posted, from, to);
  const name = (nr: string) => accounts.find((a) => a.number === nr)?.name ?? "?";
  const t = isBalanced(tb.map((r) => ({ account: r.account, debit: r.debit, credit: r.credit })));
  return (
    <Card title="Proef- en saldibalans">
      <div className="flex flex-wrap items-end gap-2"><Period {...{ from, to, setFrom, setTo }} /><Button size="sm" variant="outline" onClick={() => exportXlsx(`saldibalans_${to}.xlsx`, tb.map((r) => ({ rekening: r.account, naam: name(r.account), debet: r.debit, credit: r.credit, saldo: r.saldo })))}>Exporteer Excel</Button></div>
      <table className="mt-3 w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground"><th>Rekening</th><th>Naam</th><th className="text-right">Debet</th><th className="text-right">Credit</th><th className="text-right">Saldo</th></tr></thead>
        <tbody>{tb.map((r) => <tr key={r.account} className="border-t border-border"><td className="font-mono">{r.account}</td><td>{name(r.account)}</td><td className="text-right">{eur(r.debit)}</td><td className="text-right">{eur(r.credit)}</td><td className="text-right">{eur(r.saldo)}</td></tr>)}
          <tr className="border-t-2 border-border font-semibold"><td colSpan={2}>Totaal</td><td className="text-right">{eur(t.debit)}</td><td className="text-right">{eur(t.credit)}</td><td className={"text-right " + (t.diff ? "text-destructive" : "")}>{eur(t.diff)}</td></tr>
        </tbody></table>
    </Card>
  );
}

// ---------- Balans & resultaat ----------
function Balans({ c, companyName }: { c: string; companyName: string }) {
  const { data: accounts = [] } = useAccounts(c);
  const { data: posted = [] } = usePosted(c);
  const [from, setFrom] = useState(yearStart()); const [to, setTo] = useState(today());
  const tb = trialBalance(posted, from, to);
  const st = statements(tb);
  const name = (nr: string) => accounts.find((a) => a.number === nr)?.name ?? "?";
  const list = (f: (n: number) => boolean, sign: 1 | -1) => tb.filter((r) => f(accountClass(r.account)) && r.saldo).map((r) => <div key={r.account} className="flex justify-between border-t border-border py-0.5 text-sm"><span><span className="font-mono">{r.account}</span> {name(r.account)}</span><span>{eur(sign * r.saldo)}</span></div>);
  return (
    <div className="space-y-3">
      {!posted.length && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          Nog geen boekingen voor dit bedrijf — balans en resultaat blijven daarom leeg. Ga naar Finance → Facturen → “Regels toepassen”, en daarna naar Dagboeken → “Nu boeken”. Voor een volledige balans is ook de openingsbalans van je boekhouder nodig (Rekeningschema → Balans importeren).
          <div className="mt-2 flex gap-2">
            <Link to="/finance" search={{ tab: "facturen", id: undefined, maand: undefined }}><Button size="sm" variant="outline">Naar facturen</Button></Link>
            <Link to="/boekhouding" search={{ tab: "dagboeken" }}><Button size="sm" variant="outline">Naar dagboeken</Button></Link>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <Period {...{ from, to, setFrom, setTo }} />
        <Button size="sm" onClick={() => window.print()}>Afdrukken / PDF</Button>
        <Button size="sm" variant="outline" onClick={() => {
          const row = (deel: string, r: { account: string; saldo: number }, sign: number) => ({ deel, rekening: r.account, naam: name(r.account), bedrag: r2(sign * r.saldo) });
          const cl = (r: { account: string }) => accountClass(r.account);
          const rows = [
            ...tb.filter((r) => r.saldo && ([2, 3].includes(cl(r)) || (cl(r) >= 4 && cl(r) <= 5 && r.saldo > 0))).map((r) => row("Activa", r, 1)),
            ...tb.filter((r) => r.saldo && (cl(r) === 1 || (cl(r) >= 4 && cl(r) <= 5 && r.saldo < 0))).map((r) => row("Passiva", r, -1)),
            { deel: "Passiva", rekening: "", naam: "Resultaat van de periode", bedrag: r2(st.resultaat) },
            ...tb.filter((r) => cl(r) === 7 && r.saldo).map((r) => row("Opbrengsten", r, -1)),
            ...tb.filter((r) => cl(r) === 6 && !r.account.startsWith("67") && r.saldo).map((r) => row("Kosten", r, 1)),
            ...tb.filter((r) => r.account.startsWith("67") && r.saldo).map((r) => row("Belastingen", r, 1)),
          ];
          exportXlsx(`balans_${companyName}_${to}.xlsx`, rows);
        }}>Exporteer Excel</Button>
      </div>
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">{companyName} — Balans & resultatenrekening</h1>
        <p className="text-sm">Periode {from} t/m {to} · afgedrukt op {today()}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-4 print:grid-cols-4">
        <Card title="Opbrengsten"><p className="text-2xl font-bold">{eur(st.opbrengsten)}</p></Card>
        <Card title="Kosten"><p className="text-2xl font-bold">{eur(st.kosten)}</p></Card>
        <Card title="Belastingen"><p className="text-2xl font-bold">{eur(st.belastingen)}</p></Card>
        <Card title="Resultaat"><p className="text-2xl font-bold">{eur(st.resultaat)}</p></Card>
      </div>
      <div className="grid gap-3 lg:grid-cols-2 print:grid-cols-2">
        <Card title="Resultatenrekening — kosten (6, excl. belastingen)">{tb.filter((r) => accountClass(r.account) === 6 && !r.account.startsWith("67") && r.saldo).map((r) => <div key={r.account} className="flex justify-between border-t border-border py-0.5 text-sm"><span><span className="font-mono">{r.account}</span> {name(r.account)}</span><span>{eur(r.saldo)}</span></div>)}</Card>
        <Card title="Resultatenrekening — opbrengsten (7)">{list((n) => n === 7, -1)}</Card>
        <Card title="Belastingen (67)">{tb.filter((r) => r.account.startsWith("67") && r.saldo).map((r) => <div key={r.account} className="flex justify-between border-t border-border py-0.5 text-sm"><span><span className="font-mono">{r.account}</span> {name(r.account)}</span><span>{eur(r.saldo)}</span></div>)}</Card>
        <Card title={`Balans op ${to} — activa ${eur(st.activa)}`}>
          {tb.filter((r) => r.saldo && ([2, 3].includes(accountClass(r.account)) || (accountClass(r.account) >= 4 && accountClass(r.account) <= 5 && r.saldo > 0))).map((r) => <div key={r.account} className="flex justify-between border-t border-border py-0.5 text-sm"><span><span className="font-mono">{r.account}</span> {name(r.account)}</span><span>{eur(r.saldo)}</span></div>)}
        </Card>
        <Card title={`Balans op ${to} — passiva ${eur(st.passiva)}`}>
          {tb.filter((r) => r.saldo && (accountClass(r.account) === 1 || (accountClass(r.account) >= 4 && accountClass(r.account) <= 5 && r.saldo < 0))).map((r) => <div key={r.account} className="flex justify-between border-t border-border py-0.5 text-sm"><span><span className="font-mono">{r.account}</span> {name(r.account)}</span><span>{eur(-r.saldo)}</span></div>)}
          <div className="flex justify-between border-t border-border py-0.5 text-sm font-medium"><span>Resultaat van de periode</span><span>{eur(st.resultaat)}</span></div>
          {!st.sluit && <p className="mt-1 text-xs text-destructive">Balans sluit niet — controleer de openingsbalans.</p>}
        </Card>
      </div>
    </div>
  );
}

// ---------- Btw ----------
function Btw({ c }: { c: string }) {
  const { data: posted = [] } = usePosted(c);
  const y = new Date().getFullYear(); const q = Math.floor(new Date().getMonth() / 3);
  const [from, setFrom] = useState(`${y}-${String(q * 3 + 1).padStart(2, "0")}-01`);
  const [to, setTo] = useState(new Date(y, q * 3 + 3, 0).toISOString().slice(0, 10));
  const v = vatReport(posted, from, to);
  const labels: Record<string, string> = { "01": "Verkoop 6%", "02": "Verkoop 12%", "03": "Verkoop 21%", "45": "Verkoop medecontractant/0%", "49": "Uitgereikte creditnota's", "54": "Verschuldigde btw", "59": "Aftrekbare btw", "63": "Btw op ontvangen creditnota's", "64": "Btw op uitgereikte creditnota's", "81": "Aankoop goederen", "82": "Aankoop diensten en diverse", "83": "Investeringen", "85": "Ontvangen creditnota's" };
  return (
    <Card title="Btw-overzicht per rooster">
      <Period {...{ from, to, setFrom, setTo }} />
      <table className="mt-3 w-full text-sm"><tbody>
        {Object.keys(labels).filter((k) => v.grids[k]).map((k) => <tr key={k} className="border-t border-border"><td className="w-12 font-mono">{k}</td><td>{labels[k]}</td><td className="text-right">{eur(v.grids[k] ?? 0)}</td></tr>)}
        <tr className="border-t-2 border-border font-semibold"><td className="font-mono">{v.saldo >= 0 ? "71" : "72"}</td><td>{v.saldo >= 0 ? "Te betalen" : "Terug te vorderen"}</td><td className="text-right">{eur(Math.abs(v.saldo))}</td></tr>
      </tbody></table>
      <p className="mt-2 text-xs text-muted-foreground">Gebaseerd op geboekte facturen. Controle-overzicht — indienen gebeurt door je boekhouder via Intervat. Medecontractant, intracommunautair en niet-aftrekbare btw zijn niet apart verwerkt.</p>
    </Card>
  );
}

// ---------- Spaarrekening: sleepvenster voor CODA/CSV/Excel ----------
function SavingsDropZone({ onFile }: { onFile: (f: File) => Promise<void> }) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const handle = (f?: File | null) => {
    if (!f || busy) return;
    setBusy(true);
    void onFile(f).catch(() => toast.error("Bestand kon niet ingelezen worden")).finally(() => setBusy(false));
  };
  return (
    <label
      className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center text-sm transition-colors ${drag ? "border-primary bg-primary/10" : "border-border hover:border-primary/60"}`}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files?.[0]); }}
    >
      <input type="file" accept=".cod,.coda,.txt,.csv,.xlsx,.xls" className="hidden" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} />
      <span className="font-medium">{busy ? "Bezig met inlezen…" : "Sleep hier een CODA-, CSV- of Excel-bestand"}</span>
      <span className="text-xs text-muted-foreground">of klik om een bestand te kiezen</span>
    </label>
  );
}

// ---------- Bank ----------
function Bank({ c }: { c: string }) {
  const qc = useQueryClient();
  const { data: accounts = [] } = useAccounts(c);
  const { data: tx = [] } = useQuery({ queryKey: ["fin", "bank", c], queryFn: async () => (await fetchAll((a, b) => db.from("fin_bank_tx").select("*").eq("company_id", c).order("tx_date", { ascending: false }).range(a, b))) as any[], refetchInterval: 30_000 });
  const { data: open = [] } = useQuery({ queryKey: ["fin", "open-inv", c], queryFn: async () => (await db.from("fin_invoices").select("*, fin_invoice_lines(ex_vat, vat)").eq("company_id", c).neq("status", "betaald")).data ?? [] });
  const { data: paidNoTx = [] } = useQuery({ queryKey: ["fin", "paid-unlinked", c], queryFn: async () => {
    const paid = (await fetchAll((a, b) => db.from("fin_invoices").select("*, fin_invoice_lines(ex_vat, vat)").eq("company_id", c).eq("status", "betaald").eq("doc_type", "factuur").range(a, b))) as any[];
    const linked = new Set(((await fetchAll((a, b) => db.from("fin_bank_tx").select("matched_invoice_id").eq("company_id", c).not("matched_invoice_id", "is", null).range(a, b))) as any[]).map((r) => r.matched_invoice_id));
    return paid.filter((i) => !linked.has(i.id));
  } });
  const [bankAcc, setBankAcc] = useState("550000");
  const ctl = controlAccounts(accounts.map((a) => a.number));
  useEffect(() => { if (accounts.length) setBankAcc(ctl.bank); }, [accounts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = async () => { await Promise.all(["fin", "facturen", "ponto_transactions", "dashboard-omzet", "bank-link-invoices"].map(key => qc.invalidateQueries({ queryKey: [key] }))); };
  const total = (i: any) => r2(i.fin_invoice_lines.reduce((a: number, l: any) => a + Number(l.ex_vat) + Number(l.vat), 0) * (i.doc_type === "creditnota" ? -1 : 1));
  const onCodaFile = async (f: File, acc = bankAcc) => {
    const txns = parseCoda(await f.text());
    if (!txns.length) return void toast.error("Geen verrichtingen gevonden in dit CODA-bestand");
    const payload = txns.map((r, i) => ({ company_id: c, bank_account: acc, tx_date: r.tx_date, amount: r.amount, counterparty: r.counterparty, counterparty_account: r.counterparty_account, description: r.description, dedupe_key: dedupeKey([acc, r.tx_date, r.amount, r.counterparty, r.description, r.reference ?? i]) }));
    const { error } = await db.from("fin_bank_tx").upsert(payload, { onConflict: "company_id,dedupe_key", ignoreDuplicates: true });
    error ? toast.error("Import mislukt") : toast.success(`${payload.length} verrichtingen uit CODA ingelezen (dubbels genegeerd)`); refresh();
  };
  const onSavingsFile = async (f: File) => {
    const isCoda = /\.(cod|coda|txt)$/i.test(f.name);
    await (isCoda ? onCodaFile(f, SAVINGS_ACCOUNT) : onFile(f, SAVINGS_ACCOUNT));
    markSavingsQuarterDone();
  };
  const onFile = async (f: File, acc = bankAcc) => {
    const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0] ?? ""] ?? {}, { defval: "" });
    const cols = Object.keys(rows[0] ?? {}); const find = (re: RegExp) => cols.find((k) => re.test(k.toLowerCase()));
    const cd = find(/datum|date/), ca = find(/bedrag|amount/), cc = find(/tegenpartij|naam|counterpart|begunstigde/), cm = find(/mededeling|omschr|description|communic/);
    if (!cd || !ca) return void toast.error("Kolommen 'datum' en 'bedrag' niet gevonden");
    const toIso = (v: unknown) => v instanceof Date ? v.toISOString().slice(0, 10) : (() => { const s = String(v); const m = s.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : s.slice(0, 10); })();
    const payload = rows.map((r) => ({ tx_date: toIso(r[cd]), amount: parseAmount(r[ca]), counterparty: cc ? String(r[cc]) : null, description: cm ? String(r[cm]) : null }))
      .filter((r) => r.amount != null && /^\d{4}-\d{2}-\d{2}$/.test(r.tx_date))
      .map((r, i) => ({ company_id: c, bank_account: acc, ...r, dedupe_key: dedupeKey([acc, r.tx_date, r.amount, r.counterparty, r.description, i]) }));
    const { error } = await db.from("fin_bank_tx").upsert(payload, { onConflict: "company_id,dedupe_key", ignoreDuplicates: true });
    error ? toast.error("Import mislukt") : toast.success(`${payload.length} bankverrichtingen ingelezen (dubbels genegeerd)`); refresh();
  };
  const reconcile = async (t: any, inv: any) => {
    const { data, error } = await db.rpc("fin_reconcile_bank", { _transaction: t.id, _invoice: inv.id, _bank_account: t.bank_account ?? bankAcc, _counter_account: inv.direction === "aankoop" ? ctl.leveranciers : ctl.klanten, _gross: grossOf(t) ?? undefined } as any);
    if (error) throw new Error(error.message);
    return data;
  };
  const settle = async (t: any, inv: any) => {
    const { error } = await db.rpc("fin_settle_paid_invoice" as any, { _transaction: t.id, _invoice: inv.id, _bank_account: t.bank_account ?? bankAcc, _counter_account: inv.direction === "aankoop" ? ctl.leveranciers : ctl.klanten, _gross: grossOf(t) ?? undefined });
    if (error) throw new Error(error.message);
  };
  // Kaartuitbetalingen (Europabank): koppelen op het bruto bedrag uit de mededeling; commissie gaat naar 653000.
  const grossOf = (t: any) => cardGross(t.description, Number(t.amount));
  const effAmt = (t: any) => grossOf(t) ?? Math.abs(Number(t.amount));
  const paidCands = (t: any) => { const amt = Number(t.amount); return paidNoTx.filter((i: any) => (amt < 0) === (i.direction === "aankoop") && Math.abs(total(i) - effAmt(t)) < 0.025); };
  const settleClick = async (t: any, inv: any) => { try { await settle(t, inv); toast.success("Afgeletterd met betaalde factuur"); refresh(); } catch (e: any) { toast.error(e.message); } };
  const remaining = (i: any) => r2(Math.max(0, total(i) - Number(i.paid_amount ?? 0)));
  const match = async (t: any, inv: any) => {
    const counter = inv.direction === "aankoop" ? ctl.leveranciers : ctl.klanten;
    try {
      await reconcile(t, inv);
      toast.success("Afgeletterd en geboekt"); refresh();
    } catch (e: any) { toast.error(e.message); }
  };
  // Boeking en koppeling zijn twee stappen: mislukt de koppeling, dan wordt de boeking teruggedraaid zodat geen losse boeking achterblijft.
  const linkEntry = async (txId: string, entryId: string) => {
    const { error } = await db.from("fin_bank_tx").update({ entry_id: entryId }).eq("id", txId).is("entry_id", null);
    if (error) { await undoEntry(c, entryId).catch(() => {}); throw new Error(error.message); }
  };
  const book = async (t: any, account: string) => {
    try { const id = await post(c, "bank", t.tx_date, t.description || t.counterparty || "Bankverrichting", null, "bank", t.id, paymentEntry(Number(t.amount), t.bank_account ?? bankAcc, account)); await linkEntry(t.id, id); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };
  const [sel, setSel] = useState<Set<string>>(new Set());
  const bulkBook = async (account: string, label?: string) => {
    const lijst = tx.filter((t) => sel.has(t.id) && !t.entry_id);
    if (!confirm(label ? `${lijst.length} verrichtingen tegen elkaar verrekenen via rekening ${account}?` : `${lijst.length} verrichting(en) boeken op rekening ${account}?`)) return;
    let ok = 0, fout = 0;
    for (const t of lijst) {
      const oms = t.description || t.counterparty || "Bankverrichting";
      try { const id = await post(c, "bank", t.tx_date, label ? `${label} · ${oms}` : oms, label ?? null, "bank", t.id, paymentEntry(Number(t.amount), t.bank_account ?? bankAcc, account)); await linkEntry(t.id, id); ok++; }
      catch { fout++; }
    }
    fout ? toast.error(`${ok} geboekt, ${fout} mislukt`) : toast.success(label ? `${ok} verrichtingen verrekend via ${account}` : `${ok} verrichting(en) geboekt op ${account}`);
    setSel(new Set()); refresh();
  };
  // Verrekenen: alle aangevinkte verrichtingen op dezelfde rekening met een gedeeld kenmerk, zodat ze in het dagboek bij elkaar horen.
  const verreken = (account: string) => bulkBook(account, `Verrekening ${new Date().toISOString().slice(0, 10)} #${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
  // Zoeken per klant/leverancier: betalingen en openstaande facturen samen tonen en in één keer afpunten.
  const [zoek, setZoek] = useState("");
  const [selInv, setSelInv] = useState<Set<string>>(new Set());
  const zq = zoek.trim().toLowerCase();
  const vis = tx.filter((t) => !t.entry_id && (!zq || `${t.counterparty ?? ""} ${t.description ?? ""} ${t.amount}`.toLowerCase().includes(zq))).slice(0, zq ? 1000 : 200);
  const invHits = zq.length >= 2 ? open.filter((i: any) => `${i.counterparty ?? ""} ${i.number ?? ""}`.toLowerCase().includes(zq)) : [];
  const afpunten = async (lijst: any[], facturen: any[]) => {
    if (lijst.length !== 1 || facturen.length !== 1) return void toast.error("Koppel één betaling aan één factuur; gedeeltelijke betalingen blijven open.");
    await match(lijst[0], facturen[0]);
    setSel(new Set()); setSelInv(new Set());
  };
  // Automatisch afletteren: alleen als verrichting precies één passende factuur heeft én die factuur maar bij één verrichting past.
  const autoBusy = useRef(false); const autoTried = useRef(new Set<string>());
  useEffect(() => {
    if (autoBusy.current || !accounts.length || !tx.length || (!open.length && !paidNoTx.length)) return;
    const todo = tx.filter((t) => !t.entry_id);
    const fresh = (t: any) => !autoTried.current.has(t.id);
    const candOf = (t: any) => { const amt = Number(t.amount); return open.filter((i: any) => (amt < 0) === (i.direction === "aankoop") && Math.abs(remaining(i) - effAmt(t)) < 0.025); };
    const pairs = todo.map((t) => [t, candOf(t)] as const).filter(([, cs]) => cs.length === 1);
    const usage = new Map<string, number>();
    for (const t of todo) for (const i of candOf(t)) usage.set(i.id, (usage.get(i.id) ?? 0) + 1);
    // Automatisch enkel als ook de naam (of het factuurnummer) overeenkomt — een gelijk bedrag alleen is niet genoeg.
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9 ]/g, "");
    const sameParty = (t: any, i: any) => {
      if (grossOf(t) != null) return true; // bruto bedrag op de cent, eenduidig gecontroleerd via usage
      const hay = norm(`${t.counterparty ?? ""} ${t.description ?? ""}`);
      const nr = String(i.number ?? "").replace(/\D/g, "");
      if (nr.length >= 4 && hay.replace(/\s/g, "").includes(nr)) return true;
      return norm(i.counterparty ?? "").split(/\s+/).some((w) => w.length >= 4 && hay.includes(w));
    };
    const sure = pairs.filter(([t, cs]) => fresh(t) && usage.get(cs[0].id) === 1 && sameParty(t, cs[0]));
    // Handmatig betaald gemarkeerde facturen: enkel bij één eenduidige verrichting met dezelfde naam of hetzelfde nummer.
    const pUse = new Map<string, number>();
    const pc = new Map<string, any[]>();
    for (const t of todo) { if (candOf(t).length) continue; const cs = paidCands(t).filter((i: any) => sameParty(t, i)); pc.set(t.id, cs); for (const i of cs) pUse.set(i.id, (pUse.get(i.id) ?? 0) + 1); }
    const surePaid = todo.filter((t) => fresh(t) && pc.get(t.id)?.length === 1 && pUse.get(pc.get(t.id)![0].id) === 1).map((t) => [t, pc.get(t.id)!] as const);
    sure.forEach(([t]) => autoTried.current.add(t.id));
    surePaid.forEach(([t]) => autoTried.current.add(t.id));
    if (!sure.length && !surePaid.length) return;
    autoBusy.current = true;
    (async () => {
      let n = 0;
      for (const [t, cs] of sure) {
        const inv = cs[0]; const counter = inv.direction === "aankoop" ? ctl.leveranciers : ctl.klanten;
        try {
          await reconcile(t, inv);
          n++;
        } catch { /* blijft manueel te verwerken */ }
      }
      for (const [t, cs] of surePaid) { try { await settle(t, cs[0]); n++; } catch { /* manueel */ } }
      if (n) toast.success(`${n} betalingen automatisch afgeletterd`);
      await refresh();
      autoBusy.current = false;
    })();
  }, [tx, open, paidNoTx, accounts.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Factuurinfo bij afgeletterde verrichtingen + wachtrekening (499000) voor verrichtingen zonder factuur.
  const WACHT = "499000";
  const { data: allInv = [] } = useQuery({ queryKey: ["fin", "inv-all", c], queryFn: async () => (await fetchAll((a, b) => db.from("fin_invoices").select("id, number, counterparty, invoice_date").eq("company_id", c).range(a, b))) as any[] });
  const invById = useMemo(() => new Map(allInv.map((i: any) => [i.id, i])), [allInv]);
  const { data: wachtLines = [] } = useQuery({ queryKey: ["fin", "wacht", c], queryFn: async () => (await fetchAll((a, b) => db.from("fin_journal_lines").select("entry_id").eq("company_id", c).eq("account", WACHT).range(a, b))) as any[] });
  const { data: herEntries = [] } = useQuery({ queryKey: ["fin", "wacht-her", c], queryFn: async () => (await fetchAll((a, b) => db.from("fin_journal_entries").select("source_ref").eq("company_id", c).eq("source", "wacht").range(a, b))) as any[] });
  const wachtEntry = useMemo(() => new Set(wachtLines.map((l: any) => l.entry_id)), [wachtLines]);
  const herDone = useMemo(() => new Set(herEntries.map((e: any) => e.source_ref)), [herEntries]);
  const wachtIds = useMemo(() => new Set(tx.filter((t) => t.entry_id && !t.matched_invoice_id && wachtEntry.has(t.entry_id) && !herDone.has(t.id)).map((t) => t.id)), [tx, wachtEntry, herDone]);
  const wachtTx = tx.filter((t) => wachtIds.has(t.id));
  const herboek = async (t: any, account: string) => {
    if (account === WACHT) return;
    if (!confirm(`${eur(Number(t.amount))} van wachtrekening doorboeken naar ${account}?`)) return;
    try { await post(c, "divers", t.tx_date, `Uit wachtrekening · ${t.counterparty ?? t.description ?? ""}`.trim(), null, "wacht", t.id, paymentEntry(Number(t.amount), WACHT, account)); toast.success(`Doorgeboekt naar ${account}`); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };
  const [zoekOpen, setZoekOpen] = useState("");
  const zo = zoekOpen.trim().toLowerCase();
  const openVis = open.filter((i: any) => !zo || `${i.counterparty ?? ""} ${i.number ?? ""}`.toLowerCase().includes(zo)).slice(0, 300);
  return (
    <div className="space-y-3">
      <AccountList accounts={accounts} />
      <Link to="/facturen"><Button size="sm" variant="outline">Naar facturen</Button></Link>
      <PontoCard c={c} bankAcc={bankAcc} onDone={refresh} />
      <CardFeeReport companyId={c} />
      <Card title={`Spaarrekening inladen (${SAVINGS_ACCOUNT})`}>
        <SavingsDropZone onFile={onSavingsFile} />
        <p className="mt-1 text-xs text-muted-foreground">Uittreksel van de spaarrekening; alle verrichtingen worden op rekening {SAVINGS_ACCOUNT} ingelezen. Dubbels worden genegeerd.</p>
      </Card>
      <Card title="Bankuittreksels importeren">
        <div className="flex flex-wrap items-center gap-2">
          <Input list="fin-accounts" className="w-32" value={bankAcc} onChange={(e) => setBankAcc(e.target.value)} />
          <label className="cursor-pointer rounded-md border border-border px-3 py-1.5 text-sm">CSV/Excel kiezen<input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Exporteer bij je bank (KBC, BNP, Belfius…) als CSV. Kolommen datum, bedrag, tegenpartij en mededeling worden herkend.</p>
      </Card>
      <Card title={`Te verwerken (${tx.filter((t) => !t.entry_id).length})`}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Input className="max-w-sm" placeholder="Zoek klant of leverancier (naam, mededeling, bedrag)…" value={zoek} onChange={(e) => { setZoek(e.target.value); setSel(new Set()); setSelInv(new Set()); }} />
          {zoek && <><span className="text-xs text-muted-foreground">{vis.length} betaling(en) gevonden</span><Button size="sm" variant="outline" onClick={() => setSel(new Set(vis.map((t) => t.id)))}>Alle gevonden selecteren</Button><Button size="sm" variant="ghost" onClick={() => { setZoek(""); setSel(new Set()); setSelInv(new Set()); }}>Wissen</Button></>}
        </div>
        {zoek.trim().length >= 2 && (() => {
          const s = tx.filter((t) => sel.has(t.id) && !t.entry_id);
          const somTx = r2(s.reduce((a, t) => a + Number(t.amount), 0));
          const gekozen = invHits.filter((i: any) => selInv.has(i.id));
          const somInv = r2(gekozen.reduce((a: number, i: any) => a + (i.direction === "aankoop" ? -1 : 1) * total(i), 0));
          const verschil = r2(somTx - somInv);
          return (
            <div className="mb-2 rounded border border-border p-2 text-sm">
              <div className="mb-1 font-medium">Openstaande facturen ({invHits.length})</div>
              {invHits.length === 0 ? <p className="text-xs text-muted-foreground">Geen openstaande facturen voor deze zoekterm.</p> : (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {invHits.map((i: any) => (
                    <label key={i.id} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2"><input type="checkbox" checked={selInv.has(i.id)} onChange={() => setSelInv((x) => { const n = new Set(x); n.has(i.id) ? n.delete(i.id) : n.add(i.id); return n; })} />{i.invoice_date} · {i.counterparty} {i.number} <span className="text-xs text-muted-foreground">{i.direction === "aankoop" ? "aankoop" : "verkoop"}{i.doc_type === "creditnota" ? " · creditnota" : ""}</span></span>
                      <span>{eur(remaining(i))}</span>
                    </label>
                  ))}
                </div>
              )}
              {(s.length > 0 || gekozen.length > 0) && (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
                  <span>Betalingen {eur(somTx)} · facturen {eur(somInv)}</span>
                  <span className={Math.abs(verschil) < 0.01 ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{Math.abs(verschil) < 0.01 ? "Sluit exact" : `Verschil ${eur(verschil)} blijft openstaan`}</span>
                  <Button size="sm" disabled={s.length !== 1 || gekozen.length !== 1} onClick={() => afpunten(s, gekozen)}>Afpunten</Button>
                </div>
              )}
            </div>
          );
        })()}
        {(() => {
          const zicht = vis;
          const alle = zicht.length > 0 && zicht.every((t) => sel.has(t.id));
          return (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-border p-2 text-sm">
              <label className="flex items-center gap-1"><input type="checkbox" checked={alle} onChange={() => setSel(alle ? new Set() : new Set(zicht.map((t) => t.id)))} /> Alles selecteren</label>
              <span className="text-muted-foreground">{sel.size} geselecteerd{sel.size ? ` · ${eur(r2(tx.filter((t) => sel.has(t.id)).reduce((a, t) => a + Number(t.amount), 0)))}` : ""}</span>
              {sel.size > 0 && <><span className="ml-auto">Boek selectie op:</span><AccountPicker accounts={accounts} onPick={(a) => bulkBook(a)} /><Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>Wissen</Button></>}
              {(() => {
                const s = tx.filter((t) => sel.has(t.id) && !t.entry_id);
                const som = r2(s.reduce((a, t) => a + Number(t.amount), 0));
                const beide = s.some((t) => Number(t.amount) < 0) && s.some((t) => Number(t.amount) > 0);
                if (s.length < 2 || !beide) return null;
                return <div className="flex w-full flex-wrap items-center gap-2 border-t border-border pt-2">
                  <span className="font-medium">Tegen elkaar verrekenen via:</span>
                  <AccountPicker accounts={accounts} onPick={(a) => verreken(a)} />
                  <span className={Math.abs(som) < 0.01 ? "text-xs text-muted-foreground" : "text-xs text-destructive"}>{Math.abs(som) < 0.01 ? "Heffen elkaar volledig op" : `Verschil ${eur(som)} blijft op deze rekening staan`}</span>
                </div>;
              })()}
            </div>
          );
        })()}
        <div className="max-h-[60dvh] space-y-2 overflow-y-auto">
          {vis.map((t) => {
            const amt = Number(t.amount);
            const cands = open.filter((i: any) => (amt < 0) === (i.direction === "aankoop") && Math.abs(remaining(i) - effAmt(t)) < 0.025);
            return (
              <div key={t.id} className="rounded border border-border p-2 text-sm">
                <div className="flex justify-between gap-2"><label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={sel.has(t.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n; })} /><span>{t.tx_date} · {t.counterparty}{t.counterparty_account ? <span className="text-xs text-muted-foreground"> · {t.counterparty_account}</span> : null} <span className="text-xs text-muted-foreground">{t.description}</span></span></label><span className={amt < 0 ? "text-destructive" : ""}>{eur(amt)}</span></div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {cands.map((i: any) => <Button key={i.id} size="sm" variant="outline" onClick={() => match(t, i)}>Afletteren: {i.counterparty} {i.number}</Button>)}
                  {!cands.length && paidCands(t).slice(0, 3).map((i: any) => <Button key={i.id} size="sm" variant="outline" onClick={() => settleClick(t, i)}>Afletteren (al betaald): {i.counterparty} {i.number}</Button>)}
                  <AccountPicker accounts={accounts} onPick={(nr) => book(t, nr)} />
                  {!cands.length && <Button size="sm" variant="ghost" onClick={() => book(t, WACHT)}>Naar wachtrekening</Button>}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      <Card title={`Wachtrekening ${WACHT} – verrichtingen zonder factuur (${wachtTx.length} · ${eur(r2(wachtTx.reduce((a, t) => a + Number(t.amount), 0)))})`}>
        {wachtTx.length === 0 ? <p className="text-xs text-muted-foreground">Niets geparkeerd. Gebruik "Naar wachtrekening" bij een verrichting zonder factuur.</p> : (
          <div className="max-h-[50dvh] space-y-1 overflow-y-auto text-sm">
            <p className="text-xs text-muted-foreground">Deze bedragen mogen blijven staan tot de factuur er is, of je boekt ze door naar de juiste rekening.</p>
            {wachtTx.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-2">
                <span>{t.tx_date} · {t.counterparty}{t.counterparty_account ? <span className="text-xs text-muted-foreground"> · {t.counterparty_account}</span> : null} <span className="text-xs text-muted-foreground">{t.description}</span></span>
                <span className="flex items-center gap-2"><span className={Number(t.amount) < 0 ? "text-destructive" : ""}>{eur(Number(t.amount))}</span>
                  <span className="text-xs">Doorboeken naar:</span><AccountPicker accounts={accounts} onPick={(nr) => herboek(t, nr)} /></span>
              </div>
            ))}
          </div>
        )}
      </Card>
      {paidNoTx.length > 0 && <Card title={`Betaald gemarkeerd, nog niet afgeletterd (${paidNoTx.length})`}>
        <div className="max-h-[40dvh] space-y-1 overflow-y-auto text-sm">
          {paidNoTx.map((i: any) => <div key={i.id} className="flex items-center justify-between gap-2 rounded border border-border p-2"><span>{i.invoice_date} · {i.counterparty} <span className="font-mono">{i.number}</span></span><span>{eur(total(i))}</span></div>)}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Zodra de bijhorende bankverrichting binnen is, lettert de app ze automatisch af bij gelijk bedrag en naam of nummer; anders via de knop "Afletteren (al betaald)" bij de verrichting.</p>
      </Card>}
      <Card title={`Facturen zonder gekoppelde betaling (${open.length})`}>
        <Input className="mb-2 max-w-sm" placeholder="Zoek factuur (naam of nummer)…" value={zoekOpen} onChange={(e) => setZoekOpen(e.target.value)} />
        <div className="max-h-[50dvh] space-y-1 overflow-y-auto text-sm">
          {openVis.map((i: any) => (
            <div key={i.id} className="flex items-center justify-between gap-2 rounded border border-border p-2">
              <span>{i.invoice_date} · {i.counterparty} <span className="font-mono">{i.number}</span> <span className="text-xs text-muted-foreground">{i.direction === "aankoop" ? "aankoop" : "verkoop"}{i.doc_type === "creditnota" ? " · creditnota" : ""}</span></span>
              <span>{eur(remaining(i))}</span>
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Deze facturen staan nog open op Klanten/Leveranciers tot er een betaling aan gekoppeld wordt.</p>
      </Card>
      <Card title={`Verwerkt (${tx.filter((t) => t.entry_id).length})`}>
        <div className="max-h-[50dvh] space-y-1 overflow-y-auto text-sm">
          {tx.filter((t) => t.entry_id).slice(0, 300).map((t) => {
            const inv = t.matched_invoice_id ? invById.get(t.matched_invoice_id) : null;
            return (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded border border-border p-2">
              <span>{t.tx_date} · {t.counterparty}{t.counterparty_account ? <span className="text-xs text-muted-foreground"> · {t.counterparty_account}</span> : null}{" "}
                {inv ? <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs">Factuur {inv.number} · {inv.counterparty} · {inv.invoice_date}</span>
                  : t.matched_invoice_id ? <span className="text-xs text-muted-foreground">afgeletterd</span>
                  : wachtIds.has(t.id) ? <span className="text-xs text-primary">op wachtrekening</span>
                  : <span className="text-xs text-muted-foreground">geboekt zonder factuur</span>}
              </span>
              <span className="flex items-center gap-2"><span className={Number(t.amount) < 0 ? "text-destructive" : ""}>{eur(Number(t.amount))}</span>
                <Button size="sm" variant="outline" onClick={async () => { if (!confirm("Koppeling en boeking van deze betaling ongedaan maken?")) return; try { await undoEntry(c, t.entry_id); toast.success("Losgekoppeld"); refresh(); } catch (e: any) { toast.error(e.message); } }}>Ongedaan maken</Button></span>
            </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/** Zoekbare rekeningkiezer: typ meteen in de zoekbalk en krijg direct suggesties, klik om te boeken. */
function AccountPicker({ accounts, onPick }: { accounts: { id: string; number: string; name: string }[]; onPick: (nr: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const lijst = useMemo(() => {
    const s = q.trim().toLowerCase();
    const f = s ? accounts.filter((a) => `${a.number} ${a.name}`.toLowerCase().includes(s)) : accounts;
    return f.slice(0, 30);
  }, [accounts, q]);
  return (
    <div className="relative">
      <Input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Andere rekening…"
        className="w-56 text-xs"
      />
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-72 overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {lijst.length === 0 && <p className="p-2 text-xs text-muted-foreground">Geen rekening gevonden.</p>}
          {lijst.map((a) => (
            <Button variant="ghost"
              key={a.id}
              type="button"
              className="block w-full truncate px-2 py-1.5 text-left text-xs hover:bg-muted"
              onMouseDown={(e) => { e.preventDefault(); setOpen(false); setQ(""); onPick(a.number); }}
            >
              <span className="font-mono">{a.number}</span> {a.name}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Ponto ----------
function PontoCard({ c, bankAcc, onDone }: { c: string; bankAcc: string; onDone: () => void }) {
  const accountsFn = useServerFn(pontoAccounts);
  const syncFn = useServerFn(pontoSync);
  const { data: accs, error, refetch } = useQuery({ queryKey: ["ponto", "accounts"], queryFn: () => accountsFn(), retry: false });
  const [since, setSince] = useState(`${new Date().getFullYear()}-01-01`);
  const [busy, setBusy] = useState(false);
  const sync = async () => {
    setBusy(true);
    try {
      const r = await syncFn({ data: { companyId: c, bankAccount: bankAcc, since } });
      toast.success(`${r.inserted} nieuwe bankverrichtingen opgehaald (${r.fetched} bekeken)`);
      onDone(); refetch();
    } catch (e: any) { toast.error(e.message ?? "Ophalen mislukt"); }
    finally { setBusy(false); }
  };
  return (
    <Card title="Ponto – live bankrekeningen">
      <PontoConnection />
      {error ? <p className="text-sm text-destructive">Ponto niet bereikbaar: {(error as Error).message}</p> : !accs ? <p className="text-sm text-muted-foreground">Laden…</p> : (
        <div className="mb-2 grid gap-2 sm:grid-cols-2">
          {accs.map((a: any) => (
            <div key={a.id} className="rounded border border-border p-2 text-sm">
              <div className="font-medium">{a.description || "Rekening"}</div>
              <div className="text-xs text-muted-foreground">{a.iban}</div>
              <div className="text-lg font-semibold">{eur(a.balance)}</div>
              {a.synchronizedAt && <div className="text-xs text-muted-foreground">Bijgewerkt: {new Date(a.synchronizedAt).toLocaleString("nl-BE")}</div>}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>Vanaf</span>
        <Input type="date" className="w-40" value={since} onChange={(e) => setSince(e.target.value)} />
        <Button size="sm" disabled={busy} onClick={sync}>{busy ? "Ophalen…" : "Verrichtingen ophalen uit Ponto"}</Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Alleen lezen — er worden nooit betalingen uitgevoerd. Ponto werkt de bank zelf 4× per dag bij. Opgehaalde verrichtingen verschijnen hieronder om af te letteren.</p>
    </Card>
  );
}
