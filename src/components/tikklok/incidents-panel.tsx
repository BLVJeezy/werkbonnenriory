import { useEffect, useId, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, HeartPulse, Plus, Send, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { incidentEndDate, incidentSchema, incidentToday } from "@/lib/tikklok/incident-rules";
import { listIncidents, recordIncident, sendIncident } from "@/lib/tikklok/incidents.functions";

type Person = { id: string; name: string };
const formatDate = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("nl-BE");
const formatTime = (s: string) => new Date(s).toLocaleString("nl-BE", { timeZone: "Europe/Brussels" });

export function IncidentForm({ employees, employee, onSaved }: { employees: Person[]; employee?: Person | undefined; onSaved: () => void }) {
  const prefix = useId();
  const create = useServerFn(recordIncident);
  const [requestId, setRequestId] = useState("");
  const [person, setPerson] = useState(employee?.id ?? "");
  const [kind, setKind] = useState<"late" | "sick" | "no_show">("late");
  const [date, setDate] = useState("");
  const [end, setEnd] = useState("");
  const [minutes, setMinutes] = useState("");
  const [observation, setObservation] = useState("");
  const [send, setSend] = useState(false);
  useEffect(() => { const today = incidentToday(); setDate(today); setEnd(today); setRequestId(crypto.randomUUID()); }, []);
  const mutation = useMutation({
    mutationFn: async () => {
      const result = incidentSchema.safeParse({ id: requestId, employee_id: person, incident_type: kind, occurred_on: date, ends_on: incidentEndDate(kind, date, end), late_minutes: kind === "late" ? Number(minutes) : null, observation, send });
      if (!result.success) throw new Error(result.error.issues[0]?.message ?? "Controleer de velden");
      return create({ data: result.data });
    },
    onSuccess: () => { toast.success(send ? "Opgeslagen en als persoonlijke pop-up klaargezet" : "Vaststelling opgeslagen in het dossier"); setMinutes(""); setObservation(""); setSend(false); setRequestId(crypto.randomUUID()); onSaved(); },
    onError: (e) => toast.error(e.message),
  });
  return <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); mutation.mutate(); }}>
    {!employee && <div><Label htmlFor={`${prefix}-person`}>Medewerker</Label><Select value={person} onValueChange={setPerson}><SelectTrigger id={`${prefix}-person`}><SelectValue placeholder="Kies medewerker" /></SelectTrigger><SelectContent>{employees.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>}
    <div className="flex gap-2" role="group" aria-label="Soort vaststelling">
      <Button type="button" variant={kind === "late" ? "default" : "outline"} aria-pressed={kind === "late"} onClick={() => setKind("late")}><Clock className="h-4 w-4 mr-2" />Te laat</Button>
      <Button type="button" variant={kind === "sick" ? "default" : "outline"} aria-pressed={kind === "sick"} onClick={() => setKind("sick")}><HeartPulse className="h-4 w-4 mr-2" />Ziekte</Button>
      <Button type="button" variant={kind === "no_show" ? "default" : "outline"} aria-pressed={kind === "no_show"} onClick={() => setKind("no_show")}><UserX className="h-4 w-4 mr-2" />Niet opgedagen</Button>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div><Label htmlFor={`${prefix}-date`}>{kind === "sick" ? "Ziek vanaf" : "Datum"}</Label><Input required id={`${prefix}-date`} type="date" value={date} onChange={(e) => { setDate(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} /></div>
      {kind === "late" ? <div><Label htmlFor={`${prefix}-minutes`}>Minuten te laat</Label><Input required id={`${prefix}-minutes`} inputMode="numeric" type="number" min={1} max={1440} step={1} value={minutes} onChange={(e) => setMinutes(e.target.value)} /></div> : kind === "sick" ? <div><Label htmlFor={`${prefix}-end`}>Ziek tot en met</Label><Input required id={`${prefix}-end`} type="date" min={date} value={end} onChange={(e) => setEnd(e.target.value)} /></div> : null}
    </div>
    <div><Label htmlFor={`${prefix}-note`}>Feitelijke toelichting (optioneel)</Label><Textarea id={`${prefix}-note`} rows={3} maxLength={1500} placeholder={kind === "sick" ? "Bijvoorbeeld: ziekmelding ontvangen; geen medische details" : kind === "no_show" ? "Bijvoorbeeld: niet komen opdagen, geen verwittiging ontvangen" : "Bijvoorbeeld: afgesproken start 8:00, aangekomen 8:15"} value={observation} onChange={(e) => setObservation(e.target.value)} /></div>
    <div className="flex items-center gap-2"><Checkbox id={`${prefix}-send`} checked={send} onCheckedChange={(v) => setSend(v === true)} /><Label htmlFor={`${prefix}-send`}>Naar medewerker sturen als persoonlijke pop-up</Label></div>
    <Button type="submit" disabled={mutation.isPending || !person || !requestId}>{send && <Send className="h-4 w-4 mr-2" />}{mutation.isPending ? "Opslaan…" : send ? "Opslaan en versturen" : "Vaststelling opslaan"}</Button>
  </form>;
}

export function IncidentsPanel({ employees, employee }: { employees: Person[]; employee?: Person | undefined }) {
  const list = useServerFn(listIncidents);
  const send = useServerFn(sendIncident);
  const qc = useQueryClient();
  const [filter, setFilter] = useState("all");
  const [type, setType] = useState("all");
  const rows = useQuery({ queryKey: ["tikklok:incidents", employee?.id ?? "all"], queryFn: () => list({ data: employee ? { employee_id: employee.id } : {} }) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["tikklok:incidents"] }); qc.invalidateQueries({ queryKey: ["tikklok:employeeDossier"] }); qc.invalidateQueries({ queryKey: ["tikklok:employee-messages"] }); };
  const sendM = useMutation({ mutationFn: (id: string) => send({ data: { id } }), onSuccess: () => { toast.success("Persoonlijke pop-up klaargezet voor de medewerker"); refresh(); }, onError: (e) => toast.error(e.message) });
  const visible = (rows.data ?? []).filter((r) => (filter === "all" || r.employee_id === filter) && (type === "all" || r.incident_type === type));
  return <section className="space-y-6">
    <div><h2 className="heading-display text-2xl mb-4">Nieuwe vaststelling{employee ? ` — ${employee.name}` : ""}</h2><IncidentForm employees={employees} employee={employee} onSaved={refresh} /></div>
    <div className="border-t pt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3"><h3 className="font-semibold mr-auto">Dossierhistoriek · {visible.length}</h3>
        {!employee && <Select value={filter} onValueChange={setFilter}><SelectTrigger aria-label="Filter medewerker" className="w-full sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle medewerkers</SelectItem>{employees.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>}
        <Select value={type} onValueChange={setType}><SelectTrigger aria-label="Filter soort" className="w-full sm:w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Alle soorten</SelectItem><SelectItem value="late">Te laat</SelectItem><SelectItem value="sick">Ziekte</SelectItem><SelectItem value="no_show">Niet opgedagen</SelectItem></SelectContent></Select>
      </div>
      {rows.isLoading ? <p className="text-muted-foreground text-sm">Laden…</p> : rows.isError ? <p role="alert" className="text-destructive text-sm">{rows.error.message}</p> : visible.length === 0 ? <p className="text-muted-foreground text-sm">Geen vaststellingen.</p> : <ul className="divide-y divide-border">{visible.map((r) => <li key={r.id} className="py-4 space-y-2">
        <div className="flex items-start justify-between flex-wrap gap-2"><div><p className="font-semibold">{!employee && `${r.employee_name} · `}{r.incident_type === "late" ? `Te laat · ${r.late_minutes} min` : r.incident_type === "no_show" ? "Niet opgedagen" : "Ziekte"}</p><p className="text-sm text-muted-foreground">{formatDate(r.occurred_on)}{r.ends_on !== r.occurred_on && ` t/m ${formatDate(r.ends_on)}`}</p></div>{!r.sent_at && <Button size="sm" variant="outline" disabled={sendM.isPending} onClick={() => sendM.mutate(r.id)}><Send className="h-4 w-4 mr-2" />Naar medewerker</Button>}</div>
        {r.observation && <p className="text-sm whitespace-pre-wrap break-words">{r.observation}</p>}
        <p className="text-xs text-muted-foreground">Vastgelegd {formatTime(r.created_at)} · {r.read_at ? `Gelezen ${formatTime(r.read_at)}` : r.sent_at ? `Verstuurd als pop-up ${formatTime(r.sent_at)} · nog niet gelezen` : "Niet verstuurd"}</p>
      </li>)}</ul>}
    </div>
  </section>;
}

export function QuickIncidentButton({ employee }: { employee: Person }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  return <><Button size="icon" variant="ghost" aria-label={`Vaststelling registreren voor ${employee.name}`} title="Te laat of ziekte registreren" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /></Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Vaststelling — {employee.name}</DialogTitle></DialogHeader><IncidentForm employees={[employee]} employee={employee} onSaved={() => { qc.invalidateQueries({ queryKey: ["tikklok:incidents"] }); qc.invalidateQueries({ queryKey: ["tikklok:employeeDossier"] }); qc.invalidateQueries({ queryKey: ["tikklok:employee-messages"] }); setOpen(false); }} /></DialogContent></Dialog></>;
}