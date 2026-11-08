import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listPayrollProfiles,
  savePayrollProfile,
  calculatePayrollMonth,
  listPayrollRuns,
  getPayrollSettings,
  updatePayrollSettings,
  exportPayrollCsv,
  markPayrollPaid,
  getPayslipCompany,
  type PayrollProfileRow,
  type PayrollRunRow,
} from "@/lib/tikklok/payroll.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { normalizeSimulation, simulationFields } from "@/lib/tikklok/payroll-simulation";
import { Calculator, CheckCircle2, Download, FileText, Save, Settings2, UserCog, Wallet } from "lucide-react";

function hm(min: number) {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}u${String(m % 60).padStart(2, "0")}`;
}

function esc(v: unknown) {
  return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] ?? c));
}

function isPayDue(period: string) {
  const now = new Date();
  const [y, m] = period.split("-").map(Number);
  const cur = now.getFullYear() * 12 + now.getMonth();
  const sel = y * 12 + (m - 1);
  if (sel < cur) return true;
  if (sel > cur) return false;
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() >= last - 4;
}

function openPayslip(r: PayrollRunRow, company: any, period: string) {
  const w = window.open("", "_blank");
  if (!w) return toast.error("Sta pop-ups toe om de loonbrief te openen");
  const [y, m] = period.split("-").map(Number);
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("nl-BE", { month: "long", year: "numeric" });
  const rate = r.wage_mode === "hourly" && r.hourly_wage != null ? `${eur(r.hourly_wage)} / uur` : r.monthly_wage != null ? `${eur(r.monthly_wage)} / maand` : "—";
  const row = (l: string, v: string, b = false) => `<tr${b ? ' class="b"' : ""}><td>${esc(l)}</td><td class="r">${esc(v)}</td></tr>`;
  w.document.write(`<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>Loonbrief ${esc(r.employee_name)} ${esc(monthLabel)}</title>
<style>body{font-family:Arial,sans-serif;color:#111;max-width:720px;margin:32px auto;padding:0 16px}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:6px 4px;border-bottom:1px solid #ddd}.r{text-align:right}.b td{font-weight:bold;border-top:2px solid #111}.head{display:flex;justify-content:space-between;gap:16px;font-size:13px}.muted{color:#666;font-size:11px;margin-top:24px}@media print{button{display:none}}</style></head><body>
<button onclick="window.print()">Afdrukken / PDF</button>
<div class="head"><div><strong>${esc(company?.company_name || "Werkgever")}</strong><br>${esc(company?.street_address)}<br>${esc([company?.postal_code, company?.city].filter(Boolean).join(" "))}<br>${company?.enterprise_number ? "KBO " + esc(company.enterprise_number) : ""}${company?.rsz_number ? "<br>RSZ " + esc(company.rsz_number) : ""}</div>
<div class="r"><h1>Loonbrief</h1>${esc(monthLabel)}<br><strong>${esc(r.employee_name)}</strong><br>${esc(r.status_label)}${r.job_title ? "<br>" + esc(r.job_title) : ""}${r.job_category ? "<br>Beroepscategorie: " + esc(r.job_category) : ""}</div></div>
<table>${row("Gewerkte uren", hm(r.worked_minutes))}${row("Loon", rate)}${row("Reguliere uren", hm(r.breakdown?.regularMinutes ?? r.worked_minutes))}${row("Opgespaarde overuren deze maand", hm(r.banked_overtime_minutes))}${row("Brutoloon", eur(r.gross), true)}${row("Basis RSZ", eur(r.breakdown?.rszBasis ?? r.gross))}${row("RSZ werknemer", "− " + eur(r.rsz_employee))}${row("Belastbare vergoedingen", eur(r.breakdown?.taxableAllowances ?? 0))}${row("Belastbaar loon", eur(r.taxable))}${row("Bedrijfsvoorheffing", "− " + eur(r.bv))}${row("Nettovergoedingen", eur(r.breakdown?.netAllowances ?? 0))}${row("Waarvan onderhoud kledij", eur(r.breakdown?.clothingAllowance ?? 0))}${row("8222 Totaal verplaatsing (reeds inbegrepen)", eur(r.breakdown?.commuteTotal ?? 0))}${row("Netto-inhoudingen", "− " + eur(r.breakdown?.deductions ?? 0))}${row("Nettoloon", eur(r.net), true)}${row("Voorschotten", "− " + eur(r.breakdown?.advances ?? 0))}${row("Te betalen", eur(r.payable), true)}</table>
<table>${row("Openstaande overuren", hm(r.overtime_open_minutes))}${row("Opgespaarde overuren: brutowaarde aan 150% (niet uitbetaald)", eur(r.overtime_value))}${row("RSZ werkgever", eur(r.rsz_employer))}${row("Reserve vakantiegeld", eur(r.holiday_pay_reserve))}${row("Reserve eindejaarspremie", eur(r.year_end_bonus_reserve))}${row("Totale werkgeverskost excl. opgespaarde overuren", eur(r.employer_cost))}${row("Status", r.paid_at ? "Betaald op " + new Date(r.paid_at).toLocaleDateString("nl-BE") : "Nog niet betaald")}</table>
<p class="muted">Indicatieve loonbrief op basis van de ingestelde parameters. De officiële loonfiche wordt opgemaakt door het sociaal secretariaat.</p>
</body></html>`);
  w.document.close();
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function eur(n: number) {
  return new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(n);
}

function parseDecimal(v: string): number | null {
  const s = v.trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmtNum(v: number | null | undefined): string {
  if (v == null) return "";
  return String(v).replace(".", ",");
}

export function PayrollPanel() {
  const [period, setPeriod] = useState(currentMonth());
  return (
    <Tabs defaultValue="overview">
      <TabsList>
        <TabsTrigger value="overview"><Calculator className="h-4 w-4 mr-1" /> Loonoverzicht</TabsTrigger>
        <TabsTrigger value="profiles"><UserCog className="h-4 w-4 mr-1" /> Loonprofielen</TabsTrigger>
        <TabsTrigger value="settings"><Settings2 className="h-4 w-4 mr-1" /> Parameters</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="mt-6">
        <PayrollOverview period={period} setPeriod={setPeriod} />
      </TabsContent>
      <TabsContent value="profiles" className="mt-6">
        <ProfilesPanel />
      </TabsContent>
      <TabsContent value="settings" className="mt-6">
        <SettingsPanel />
      </TabsContent>
    </Tabs>
  );
}

export function PayrollCostReports() {
  const [period, setPeriod] = useState(currentMonth());
  return <PayrollOverview period={period} setPeriod={setPeriod} />;
}

function PayrollOverview({ period, setPeriod }: { period: string; setPeriod: (v: string) => void }) {
  const listRuns = useServerFn(listPayrollRuns);
  const calc = useServerFn(calculatePayrollMonth);
  const exportCsv = useServerFn(exportPayrollCsv);
  const markPaid = useServerFn(markPayrollPaid);
  const getCompany = useServerFn(getPayslipCompany);
  const qc = useQueryClient();
  const companyQ = useQuery({ queryKey: ["tikklok:payslip-company"], queryFn: () => getCompany() });
  const paidMut = useMutation({
    mutationFn: (paid: boolean) => markPaid({ data: { period, paid } }),
    onSuccess: (_r, paid) => {
      toast.success(paid ? "Loon gemarkeerd als betaald" : "Betaling ongedaan gemaakt");
      qc.invalidateQueries({ queryKey: ["tikklok:payroll-runs", period] });
    },
    onError: (e: any) => toast.error(e.message ?? "Opslaan mislukt"),
  });

  const runsQ = useQuery({
    queryKey: ["tikklok:payroll-runs", period],
    queryFn: () => listRuns({ data: { period } }),
  });

  const calcMut = useMutation({
    mutationFn: () => calc({ data: { period } }),
    onSuccess: (r) => {
      toast.success(`Berekend voor ${r.calculated} medewerker(s)`);
      qc.invalidateQueries({ queryKey: ["tikklok:payroll-runs", period] });
    },
    onError: (e: any) => toast.error(e.message ?? "Berekening mislukt"),
  });

  async function handleExport() {
    try {
      const res = await exportCsv({ data: { period } });
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = res.filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e.message ?? "Export mislukt");
    }
  }

  const totals = useMemo(() => {
    const rows = runsQ.data ?? [];
    return rows.reduce(
      (acc, r) => {
        acc.gross += r.gross;
        acc.net += r.payable;
        acc.bv += r.bv;
        acc.rsz += r.rsz_employee + r.rsz_employer;
        acc.cost += r.employer_cost;
        return acc;
      },
      { gross: 0, net: 0, bv: 0, rsz: 0, cost: 0 },
    );
  }, [runsQ.data]);
  const rowsAll = runsQ.data ?? [];
  const allPaid = rowsAll.length > 0 && rowsAll.every((r) => r.paid_at);
  const due = rowsAll.length > 0 && !allPaid && isPayDue(period);
  const totalMinutes = rowsAll.reduce((a, r) => a + r.worked_minutes, 0);
  const totalOvertime = rowsAll.reduce((a, r) => a + r.overtime_open_minutes, 0);

  return (
    <div className="space-y-6">
      <Card className="p-4 flex flex-wrap items-end gap-4">
        <div>
          <Label>Periode</Label>
          <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1" />
        </div>
        <Button onClick={() => calcMut.mutate()} disabled={calcMut.isPending}>
          <Calculator className="h-4 w-4 mr-1" /> {calcMut.isPending ? "Berekenen…" : "Bereken maand"}
        </Button>
        <Button variant="outline" onClick={handleExport} disabled={(runsQ.data?.length ?? 0) === 0}>
          <Download className="h-4 w-4 mr-1" /> Export sociaal secretariaat
        </Button>
        {rowsAll.length > 0 && (allPaid ? (
          <Button variant="outline" onClick={() => paidMut.mutate(false)} disabled={paidMut.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-1 text-primary" /> Loon betaald op {new Date(rowsAll[0]?.paid_at ?? "").toLocaleDateString("nl-BE")}
          </Button>
        ) : (
          <Button onClick={() => paidMut.mutate(true)} disabled={paidMut.isPending} className={due ? "animate-pulse ring-4 ring-primary/60 shadow-lg shadow-primary/40" : ""} variant={due ? "default" : "secondary"}>
            <Wallet className="h-4 w-4 mr-1" /> {due ? "Loon moet betaald worden — markeer als betaald" : "Markeer loon als betaald"}
          </Button>
        ))}
      </Card>

      {rowsAll.length > 0 && (
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Verslag {period}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><div className="text-muted-foreground">Gewerkte uren</div><div className="font-semibold">{hm(totalMinutes)}</div></div>
            <div><div className="text-muted-foreground">Te betalen netto</div><div className="font-semibold">{eur(totals.net)}</div></div>
            <div><div className="text-muted-foreground">Totale loonkost</div><div className="font-semibold">{eur(totals.cost)}</div></div>
            <div><div className="text-muted-foreground">Openstaande overuren</div><div className="font-semibold">{hm(totalOvertime)} · {eur(rowsAll.reduce((sum, r) => sum + r.overtime_value, 0))} aan 150%</div></div>
          </div>
        </Card>
      )}

      {runsQ.data && runsQ.data.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Totaal bruto" value={eur(totals.gross)} />
          <StatCard label="Totaal netto" value={eur(totals.net)} />
          <StatCard label="RSZ totaal" value={eur(totals.rsz)} />
          <StatCard label="Bedrijfsvoorheffing" value={eur(totals.bv)} />
          <StatCard label="Loonkost werkgever" value={eur(totals.cost)} />
        </div>
      )}

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Naam</TableHead>
              <TableHead>Statuut</TableHead>
              <TableHead className="text-right">Uren</TableHead>
              <TableHead className="text-right">Bruto</TableHead>
              <TableHead className="text-right">RSZ werkn.</TableHead>
              <TableHead className="text-right">BV</TableHead>
              <TableHead className="text-right">Te betalen</TableHead>
              <TableHead className="text-right">Werkgeverskost</TableHead>
              <TableHead className="text-right">Overuren</TableHead>
              <TableHead className="text-right">Loonbrief</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runsQ.isLoading && (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Laden…</TableCell></TableRow>
            )}
            {runsQ.data?.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">Nog geen berekening voor deze maand. Klik op "Bereken maand".</TableCell></TableRow>
            )}
            {runsQ.data?.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.employee_name}</TableCell>
                <TableCell>{r.status_label}</TableCell>
                <TableCell className="text-right">{hm(r.worked_minutes)}</TableCell>
                <TableCell className="text-right">{eur(r.gross)}</TableCell>
                <TableCell className="text-right">{eur(r.rsz_employee)}</TableCell>
                <TableCell className="text-right">{eur(r.bv)}</TableCell>
                <TableCell className="text-right font-semibold">{eur(r.payable)}</TableCell>
                <TableCell className="text-right">{eur(r.employer_cost)}</TableCell>
                <TableCell className="text-right"><div>{hm(r.overtime_open_minutes)}</div><div className="text-xs text-muted-foreground">150% · {eur(r.overtime_value)}</div></TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => openPayslip(r, companyQ.data, period)}><FileText className="h-4 w-4 mr-1" /> Loonbrief</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {(runsQ.data ?? []).some((r) => r.warnings.length > 0) && (
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Waarschuwingen</h3>
          <ul className="text-sm space-y-1 text-muted-foreground">
            {(runsQ.data ?? []).flatMap((r) =>
              r.warnings.map((w, i) => <li key={`${r.id}-${i}`}>• {r.employee_name}: {w}</li>),
            )}
          </ul>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3">
      <div className="text-xs uppercase text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </Card>
  );
}

function ProfilesPanel() {
  const fetchList = useServerFn(listPayrollProfiles);
  const q = useQuery({ queryKey: ["tikklok:payroll-profiles"], queryFn: () => fetchList() });
  const [editing, setEditing] = useState<PayrollProfileRow | null>(null);

  return (
    <div className="space-y-4">
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Naam</TableHead>
              <TableHead>Statuut</TableHead>
              <TableHead>Barema</TableHead>
              <TableHead className="text-right">Maandloon</TableHead>
              <TableHead className="text-right">Uurloon</TableHead>
              <TableHead>BV</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data?.map((p) => (
              <TableRow key={p.employee_id}>
                <TableCell className="font-medium">{p.employee_name}</TableCell>
                <TableCell>{p.status_label}</TableCell>
                <TableCell>{p.barema ?? "—"}</TableCell>
                <TableCell className="text-right">{p.monthly_wage != null ? eur(p.monthly_wage) : "—"}</TableCell>
                <TableCell className="text-right">{p.hourly_wage != null ? eur(p.hourly_wage) : "—"}</TableCell>
                <TableCell>Schaal {p.bv_scale} ({p.dependents} pers. t.l.)</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)}>Bewerken</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {editing && <ProfileDialog profile={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function ProfileDialog({ profile, onClose }: { profile: PayrollProfileRow; onClose: () => void }) {
  const [form, setForm] = useState({ ...profile });
  const [simulation, setSimulation] = useState<Record<string, string>>(() => {
    const values = normalizeSimulation(profile.simulation_parameters);
    return Object.fromEntries(simulationFields.map(({ key, pct }) => [key, values[key] == null ? "" : String(Number(values[key]) * (pct ? 100 : 1)).replace(".", ",")]));
  });
  const save = useServerFn(savePayrollProfile);
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: () => save({ data: {
      employee_id: form.employee_id,
      status: form.status,
      barema: form.barema,
      wage_mode: form.wage_mode,
      monthly_wage: form.monthly_wage,
      hourly_wage: form.hourly_wage,
      weekly_hours: form.weekly_hours,
      bv_scale: form.bv_scale,
      dependents: form.dependents,
      holiday_pay_enabled: form.holiday_pay_enabled,
      year_end_bonus_enabled: form.year_end_bonus_enabled,
      fixed_bv_monthly: form.fixed_bv_monthly,
      notes: form.notes,
      simulation_parameters: Object.fromEntries(simulationFields.map(({ key, pct }) => {
        const raw = simulation[key]?.trim() ?? "";
        const value = raw === "" ? null : Number(raw.replace(",", "."));
        if (value != null && !Number.isFinite(value)) throw new Error("Ongeldige loonparameter");
        return [key, value == null ? undefined : value / (pct ? 100 : 1)];
      })),
    }}),
    onSuccess: async () => {
      toast.success("Loonprofiel opgeslagen");
      await qc.invalidateQueries({ queryKey: ["tikklok:payroll-profiles"] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message ?? "Opslaan mislukt"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Loonprofiel — {profile.employee_name}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Statuut</Label>
            <Select value={form.status} onValueChange={(v: any) => setForm({ ...form, status: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Vaste werknemer</SelectItem>
                <SelectItem value="temp">Uitzendkracht</SelectItem>
                <SelectItem value="student">Jobstudent</SelectItem>
                <SelectItem value="director">Bedrijfsleider</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Paritair comité / barema</Label>
            <Input value={form.barema ?? ""} onChange={(e) => setForm({ ...form, barema: e.target.value || null })} className="mt-1" placeholder="bv. PC 200" />
          </div>
          <div>
            <Label>Loonvorm</Label>
            <Select value={form.wage_mode} onValueChange={(v: any) => setForm({ ...form, wage_mode: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Maandloon</SelectItem>
                <SelectItem value="hourly">Uurloon</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Wekelijkse uren</Label>
            <Input type="text" inputMode="decimal" value={fmtNum(form.weekly_hours)} onChange={(e) => setForm({ ...form, weekly_hours: parseDecimal(e.target.value) })} className="mt-1" placeholder="bv. 38" />
          </div>
          <div>
            <Label>Maandloon (€)</Label>
            <Input type="text" inputMode="decimal" value={fmtNum(form.monthly_wage)} onChange={(e) => setForm({ ...form, monthly_wage: parseDecimal(e.target.value) })} className="mt-1" placeholder="bv. 2500,00" />
          </div>
          <div>
            <Label>Uurloon (€)</Label>
            <Input type="text" inputMode="decimal" value={fmtNum(form.hourly_wage)} onChange={(e) => setForm({ ...form, hourly_wage: parseDecimal(e.target.value) })} className="mt-1" placeholder="bv. 15,50" />
          </div>
          <div>
            <Label>BV-schaal</Label>
            <Select value={form.bv_scale} onValueChange={(v: any) => setForm({ ...form, bv_scale: v })}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="I">Schaal I — alleenstaande</SelectItem>
                <SelectItem value="II">Schaal II — 2 inkomens</SelectItem>
                <SelectItem value="III">Schaal III — alleenstaande met last</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Personen ten laste</Label>
            <Input type="number" min={0} value={form.dependents} onChange={(e) => setForm({ ...form, dependents: Number(e.target.value) || 0 })} className="mt-1" />
          </div>
          {form.status === "director" && (
            <div className="col-span-2">
              <Label>Vaste maandelijkse bedrijfsvoorheffing (€)</Label>
              <Input type="text" inputMode="decimal" value={fmtNum(form.fixed_bv_monthly)} onChange={(e) => setForm({ ...form, fixed_bv_monthly: parseDecimal(e.target.value) })} className="mt-1" />
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Checkbox id="hp" checked={form.holiday_pay_enabled} onCheckedChange={(v) => setForm({ ...form, holiday_pay_enabled: !!v })} />
            <Label htmlFor="hp">Vakantiegeld reserveren</Label>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Checkbox id="ye" checked={form.year_end_bonus_enabled} onCheckedChange={(v) => setForm({ ...form, year_end_bonus_enabled: !!v })} />
            <Label htmlFor="ye">Eindejaarspremie reserveren</Label>
          </div>
          <div className="col-span-2">
            <Label>Notities</Label>
            <Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} className="mt-1" />
          </div>
          <fieldset className="col-span-2 grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
            <legend className="font-semibold">Parameters loonsecretariaat</legend>
            <p className="sm:col-span-2 text-sm text-muted-foreground">Vaste RSZ en bedrijfsvoorheffing zijn maandbedragen uit een simulatie, geen automatische wettelijke berekening. Controleer ze bij een andere maand of ander loon.</p>
            {simulationFields.map(({ key, label }) => <div key={key}><Label htmlFor={`simulation-${key}`}>{label}</Label><Input id={`simulation-${key}`} inputMode="decimal" value={simulation[key] ?? ""} onChange={(e) => setSimulation((s) => ({ ...s, [key]: e.target.value }))} /></div>)}
            <div className="sm:col-span-2 text-sm text-muted-foreground">8222 · Totaal verplaatsing: {eur((parseDecimal(simulation.commute_taxable ?? "") ?? 0) + (parseDecimal(simulation.commute_net ?? "") ?? 0))}</div>
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Annuleren</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            <Save className="h-4 w-4 mr-1" /> Opslaan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SettingsPanel() {
  const fetchSettings = useServerFn(getPayrollSettings);
  const save = useServerFn(updatePayrollSettings);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tikklok:payroll-settings"], queryFn: () => fetchSettings() });
  const [form, setForm] = useState<any>(null);

  const current = form ?? q.data;

  const mut = useMutation({
    mutationFn: () => save({ data: {
      employee_rsz_pct: Number(current.employee_rsz_pct),
      employer_rsz_pct: Number(current.employer_rsz_pct),
      student_employee_pct: Number(current.student_employee_pct),
      student_employer_pct: Number(current.student_employer_pct),
      student_yearly_hours_limit: Number(current.student_yearly_hours_limit),
      holiday_pay_reserve_pct: Number(current.holiday_pay_reserve_pct),
      year_end_bonus_reserve_pct: Number(current.year_end_bonus_reserve_pct),
      dependent_reduction_per_person: Number(current.dependent_reduction_per_person),
      bv_brackets: current.bv_brackets,
      disclaimer: current.disclaimer,
    }}),
    onSuccess: () => { toast.success("Instellingen opgeslagen"); qc.invalidateQueries({ queryKey: ["tikklok:payroll-settings"] }); },
    onError: (e: any) => toast.error(e.message ?? "Opslaan mislukt"),
  });

  if (!current) return <div className="text-muted-foreground">Laden…</div>;

  function updateBracket(idx: number, field: "upTo" | "rate", value: string) {
    const next = { ...current, bv_brackets: [...current.bv_brackets] };
    const parsed = value === "" ? null : Number(value);
    next.bv_brackets[idx] = { ...next.bv_brackets[idx], [field]: parsed };
    setForm(next);
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">
          Dit zijn de standaardparameters voor de loonberekening. Pas ze aan wanneer de wetgeving wijzigt (RSZ-percentages, jobstudentquotum, bedrijfsvoorheffing-schijven).
        </p>
      </Card>
      <Card className="p-4 grid md:grid-cols-2 gap-4">
        <Field label="RSZ werknemer (%)" value={current.employee_rsz_pct} onChange={(v) => setForm({ ...current, employee_rsz_pct: v })} pct />
        <Field label="RSZ werkgever (%)" value={current.employer_rsz_pct} onChange={(v) => setForm({ ...current, employer_rsz_pct: v })} pct />
        <Field label="Solidariteit student — werknemer (%)" value={current.student_employee_pct} onChange={(v) => setForm({ ...current, student_employee_pct: v })} pct />
        <Field label="Solidariteit student — werkgever (%)" value={current.student_employer_pct} onChange={(v) => setForm({ ...current, student_employer_pct: v })} pct />
        <Field label="Jobstudent — max. uren per jaar" value={current.student_yearly_hours_limit} onChange={(v) => setForm({ ...current, student_yearly_hours_limit: v })} />
        <Field label="Reserve vakantiegeld (%)" value={current.holiday_pay_reserve_pct} onChange={(v) => setForm({ ...current, holiday_pay_reserve_pct: v })} pct />
        <Field label="Reserve eindejaarspremie (%)" value={current.year_end_bonus_reserve_pct} onChange={(v) => setForm({ ...current, year_end_bonus_reserve_pct: v })} pct />
        <Field label="BV-reductie per persoon ten laste (€)" value={current.dependent_reduction_per_person} onChange={(v) => setForm({ ...current, dependent_reduction_per_person: v })} />
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold mb-2">Bedrijfsvoorheffing — schijven</h3>
        <p className="text-xs text-muted-foreground mb-3">Progressieve schijven op belastbaar maandloon. Laat "Tot" leeg voor de bovenste schijf.</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tot (€/maand)</TableHead>
              <TableHead>Tarief (0-1)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {current.bv_brackets.map((b: any, i: number) => (
              <TableRow key={i}>
                <TableCell><Input type="number" value={b.upTo ?? ""} onChange={(e) => updateBracket(i, "upTo", e.target.value)} /></TableCell>
                <TableCell><Input type="number" step="0.01" value={b.rate} onChange={(e) => updateBracket(i, "rate", e.target.value)} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-4">
        <Label>Disclaimer op loonstroken</Label>
        <Textarea value={current.disclaimer} onChange={(e) => setForm({ ...current, disclaimer: e.target.value })} className="mt-1" />
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          <Save className="h-4 w-4 mr-1" /> Instellingen opslaan
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, pct }: { label: string; value: number; onChange: (v: number) => void; pct?: boolean }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        step={pct ? "0.0001" : "0.01"}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1"
      />
    </div>
  );
}
