import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Banknote, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addOvertimeAdjustment, deleteOvertimeAdjustment, getAdminOvertime, listEmployees, resetOvertimeAsPaid } from "@/lib/tikklok/admin.functions";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const formatDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("nl-BE");
const formatMinutes = (minutes: number) => {
  const sign = minutes < 0 ? "−" : "";
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}u ${String(abs % 60).padStart(2, "0")}m`;
};
const hoursInput = (minutes: number) => String(Math.round((minutes / 60) * 100) / 100).replace(".", ",");

export function OvertimeAdminPanel() {
  const qc = useQueryClient();
  const list = useServerFn(listEmployees);
  const getOvertime = useServerFn(getAdminOvertime);
  const addAdjustment = useServerFn(addOvertimeAdjustment);
  const removeAdjustment = useServerFn(deleteOvertimeAdjustment);
  const resetOvertime = useServerFn(resetOvertimeAsPaid);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetHours, setResetHours] = useState("");
  const [password, setPassword] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [weekHours, setWeekHours] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const employeesQ = useQuery({ queryKey: ["tikklok:employees", "overtime"], queryFn: () => list() });
  useEffect(() => {
    if (!employeeId && employeesQ.data?.[0]) setEmployeeId(employeesQ.data[0].id);
  }, [employeeId, employeesQ.data]);
  const overtimeQ = useQuery({
    queryKey: ["tikklok:adminOvertime", employeeId],
    queryFn: () => getOvertime({ data: { employeeId } }),
    enabled: Boolean(employeeId),
  });

  const saveM = useMutation({
    mutationFn: (input: { sourceWeek: string; adjustmentType: "recovered" | "paid" | "extra" }) => addAdjustment({ data: {
      employeeId,
      sourceWeek: input.sourceWeek,
      adjustmentType: input.adjustmentType,
      hours: weekHours[input.sourceWeek] ?? "",
      note: notes[input.sourceWeek] ?? "",
    } }),
    onSuccess: (_data, input) => {
      toast.success(input.adjustmentType === "paid" ? "Overuren als uitbetaald gemarkeerd" : input.adjustmentType === "extra" ? "Uren eenmalig toegevoegd" : "Overuren als teruggenomen gemarkeerd");
      setWeekHours((current) => ({ ...current, [input.sourceWeek]: "" }));
      setNotes((current) => ({ ...current, [input.sourceWeek]: "" }));
      qc.invalidateQueries({ queryKey: ["tikklok:adminOvertime", employeeId] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Verwerken mislukt"),
  });

  const resetM = useMutation({
    mutationFn: () => resetOvertime({ data: { employeeId, password, hours: resetHours.trim() } }),
    onSuccess: (result) => {
      toast.success(result.remainingBalance > 0 ? `${formatMinutes(result.minutes)} als uitbetaald geregistreerd · nog open: ${formatMinutes(result.remainingBalance)}` : `Saldo gereset: ${formatMinutes(result.minutes)} als uitbetaald geregistreerd`);
      setResetOpen(false);
      setPassword("");
      setResetHours("");
      qc.invalidateQueries({ queryKey: ["tikklok:adminOvertime", employeeId] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Resetten mislukt"),
  });

  const removeM = useMutation({
    mutationFn: (id: string) => removeAdjustment({ data: { id } }),
    onSuccess: () => {
      toast.success("Registratie verwijderd");
      qc.invalidateQueries({ queryKey: ["tikklok:adminOvertime", employeeId] });
    },
    onError: (error: any) => toast.error(error?.message ?? "Verwijderen mislukt"),
  });

  const data = overtimeQ.data;
  const positiveWeeks = data?.overtime.weeks.filter((week) => !week.isCurrentWeek && week.diffMinutes > 0) ?? [];

  return <div className="space-y-6">
    <div>
      <h2 className="text-xl font-semibold">Overuren verwerken</h2>
      <p className="text-sm text-muted-foreground">Markeer per afgesloten week alle of een deel van de uren als teruggenomen of uitbetaald.</p>
    </div>

    <div className="max-w-sm space-y-2">
      <Label>Medewerker</Label>
      <Select value={employeeId} onValueChange={setEmployeeId}>
        <SelectTrigger><SelectValue placeholder="Kies een medewerker" /></SelectTrigger>
        <SelectContent>{(employeesQ.data ?? []).map((employee) => <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>

    {overtimeQ.isLoading ? <p className="text-sm text-muted-foreground">Overuren laden…</p> : data && <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4"><p className="text-xs uppercase text-muted-foreground">Openstaand</p><p className="font-mono text-xl font-semibold">{formatMinutes(data.overtime.balanceMinutes)}</p></Card>
        <Card className="p-4"><p className="text-xs uppercase text-muted-foreground">Opgebouwd</p><p className="font-mono text-xl">{formatMinutes(data.overtime.overtimeMinutes)}</p></Card>
        <Card className="p-4"><p className="text-xs uppercase text-muted-foreground">Teruggenomen</p><p className="font-mono text-xl">{formatMinutes(data.overtime.recoveredMinutes)}</p></Card>
        <Card className="p-4"><p className="text-xs uppercase text-muted-foreground">Uitbetaald</p><p className="font-mono text-xl">{formatMinutes(data.overtime.paidMinutes)}</p></Card>
      </div>
      <div><Button variant="destructive" onClick={() => { setPassword(""); setResetHours(""); setResetOpen(true); }} disabled={data.overtime.balanceMinutes <= 0}><Banknote className="mr-1 h-4 w-4" /> Uitbetaling registreren</Button></div>
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Overuren als uitbetaald registreren</DialogTitle>
            <DialogDescription>Geef aan hoeveel uren zijn uitbetaald — leeg laten of "Alles" kiest voor het volledige openstaande saldo ({formatMinutes(data.overtime.balanceMinutes)}), dan komt het saldo op 0. Bevestig met je adminwachtwoord.</DialogDescription>
          </DialogHeader>
          <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); resetM.mutate(); }}>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label htmlFor="reset-hours">Aantal uitbetaalde uren</Label><Button type="button" size="sm" variant="ghost" onClick={() => setResetHours(hoursInput(data.overtime.balanceMinutes))}>Alles ({hoursInput(data.overtime.balanceMinutes)})</Button></div>
              <Input id="reset-hours" inputMode="decimal" placeholder={hoursInput(data.overtime.balanceMinutes)} value={resetHours} onChange={(event) => setResetHours(event.target.value)} />
            </div>
            <div className="space-y-2"><Label htmlFor="reset-password">Wachtwoord</Label><Input id="reset-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setResetOpen(false)}>Annuleren</Button><Button type="submit" variant="destructive" disabled={!password || resetM.isPending}>{resetM.isPending ? "Bezig…" : "Registreren"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <section className="space-y-3">
        <h3 className="font-semibold">Per week</h3>
        {positiveWeeks.length === 0 ? <p className="text-sm text-muted-foreground">Geen positieve afgesloten weken gevonden.</p> : positiveWeeks.map((week) => {
          const availableMinutes = Math.max(0, Math.min(week.openMinutes, data.overtime.balanceMinutes));
          return <Card key={week.weekStart} className="p-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div><p className="font-medium">Week van {formatDate(week.weekStart)}</p><p className="text-sm text-muted-foreground">Opgebouwd {formatMinutes(week.surplusMinutes)}{week.deficitMinutes > 0 ? ` · tekort ${formatMinutes(week.deficitMinutes)} (niet verrekend)` : ""}{week.extraMinutes > 0 ? ` · extra ${formatMinutes(week.extraMinutes)}` : ""} · teruggenomen {formatMinutes(week.recoveredMinutes)} · uitbetaald {formatMinutes(week.paidMinutes)}</p></div>
            <p className="font-mono font-semibold text-primary">Open {formatMinutes(availableMinutes)}</p>
          </div>
          <div className="grid items-end gap-3 md:grid-cols-[160px_1fr_auto_auto]">
            <div className="space-y-2"><Label htmlFor={`hours-${week.weekStart}`}>Aantal uren</Label><Input id={`hours-${week.weekStart}`} inputMode="decimal" placeholder={hoursInput(availableMinutes)} value={weekHours[week.weekStart] ?? ""} onChange={(event) => setWeekHours((current) => ({ ...current, [week.weekStart]: event.target.value }))} /></div>
            <div className="space-y-2"><Label htmlFor={`note-${week.weekStart}`}>Notitie</Label><Input id={`note-${week.weekStart}`} placeholder="Optionele notitie" value={notes[week.weekStart] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [week.weekStart]: event.target.value }))} /></div>
            <Button variant="outline" onClick={() => { setWeekHours((current) => ({ ...current, [week.weekStart]: hoursInput(availableMinutes) })); }} disabled={saveM.isPending || availableMinutes <= 0}>Alles</Button>
            <div className="flex flex-wrap gap-2"><Button onClick={() => saveM.mutate({ sourceWeek: week.weekStart, adjustmentType: "recovered" })} disabled={saveM.isPending || availableMinutes <= 0}><RotateCcw className="mr-1 h-4 w-4" /> Teruggenomen</Button><Button onClick={() => saveM.mutate({ sourceWeek: week.weekStart, adjustmentType: "paid" })} disabled={saveM.isPending || availableMinutes <= 0}><Banknote className="mr-1 h-4 w-4" /> Uitbetaald</Button><Button variant="outline" onClick={() => saveM.mutate({ sourceWeek: week.weekStart, adjustmentType: "extra" })} disabled={saveM.isPending}><Plus className="mr-1 h-4 w-4" /> Extra</Button></div>
          </div>
        </Card>;})}
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Historiek</h3>
        {data.adjustments.length === 0 ? <p className="text-sm text-muted-foreground">Nog geen overuren verwerkt.</p> : <div className="divide-y border-y">{data.adjustments.map((item) => <div key={item.id} className="flex items-center justify-between gap-4 py-3">
          <div><p className="font-medium">{item.adjustment_type === "paid" ? "Uitbetaald" : item.adjustment_type === "extra" ? "Eenmalig toegevoegd" : "Teruggenomen"} · {formatMinutes(item.minutes)}</p><p className="text-xs text-muted-foreground">Week van {formatDate(item.source_week)} · verwerkt op {formatDate(item.effective_on)}{item.note ? ` · ${item.note}` : ""}</p></div>
          {!item.leave_request_id && <Button size="icon" variant="ghost" aria-label="Registratie verwijderen" onClick={() => removeM.mutate(item.id)} disabled={removeM.isPending}><Trash2 className="h-4 w-4" /></Button>}
        </div>)}</div>}
      </section>
    </>}
  </div>;
}