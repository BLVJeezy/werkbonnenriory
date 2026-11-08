import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, ChevronDown, Clock, Info, Send } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  LEAVE_REQUEST_TYPES,
  cancelMyLeaveRequest,
  getMyOvertime,
  submitLeaveRequest,
} from "@/lib/tikklok/hr.functions";

type OvertimeData = Awaited<ReturnType<typeof getMyOvertime>>;

const formatDate = (value: string) => new Date(value).toLocaleDateString("nl-BE");
const formatDay = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("nl-BE", { weekday: "short", day: "2-digit", month: "2-digit" });

function formatMinutes(minutes: number) {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.abs(minutes);
  return `${sign}${Math.floor(abs / 60)}u ${String(abs % 60).padStart(2, "0")}m`;
}

const typeLabel = (value: string) =>
  LEAVE_REQUEST_TYPES.find((t) => t.value === value)?.label ?? value;

const statusLabel = (value: string) =>
  value === "pending" ? "In behandeling" : value === "approved" ? "Goedgekeurd" : "Afgewezen";

export function MyOvertime({
  pin,
  deviceToken,
  onClose,
}: {
  pin: string;
  deviceToken: string;
  onClose: () => void;
}) {
  const fetchOvertime = useServerFn(getMyOvertime);
  const submit = useServerFn(submitLeaveRequest);
  const cancel = useServerFn(cancelMyLeaveRequest);

  const [data, setData] = useState<OvertimeData | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestType, setRequestType] = useState<string>("vacation");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [hours, setHours] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await fetchOvertime({ data: { pin, deviceToken } }));
    } catch (e: any) {
      toast.error(e?.message ?? "Kon overuren niet ophalen");
    }
  }, [deviceToken, fetchOvertime, pin]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSubmit() {
    setBusy(true);
    try {
      await submit({
        data: { pin, deviceToken, requestType, startsOn, endsOn, hours: hours || null, note },
      });
      toast.success("Aanvraag verstuurd, je werkgever moet ze goedkeuren");
      setStartsOn("");
      setEndsOn("");
      setHours("");
      setNote("");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Aanvraag versturen mislukt");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(id: string) {
    setBusy(true);
    try {
      await cancel({ data: { pin, deviceToken, id } });
      toast.success("Aanvraag ingetrokken");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Intrekken mislukt");
    } finally {
      setBusy(false);
    }
  }

  const overtime = data?.overtime;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Overuren & vakantie{data ? ` – ${data.name}` : ""}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>Sluiten</Button>
      </div>

      {!data ? (
        <p className="text-sm text-muted-foreground">Laden…</p>
      ) : (
        <>
          {overtime?.weeklyHours == null ? (
            <p className="text-sm text-muted-foreground mb-5">
              Er staat nog geen contractueel aantal uren per week in je dossier, dus overuren kunnen niet berekend worden.
              Vraag je werkgever om dit in te vullen.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 mb-5 sm:grid-cols-4">
                <div className="rounded-lg border p-3">
                  <p className="eyebrow text-primary">Saldo</p>
                  <p className="text-lg font-mono font-semibold">{formatMinutes(overtime.balanceMinutes)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="eyebrow text-primary">Opgebouwd</p>
                  <p className="text-lg font-mono">{formatMinutes(overtime.overtimeMinutes)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="eyebrow text-primary">Gerecupereerd</p>
                  <p className="text-lg font-mono">{formatMinutes(overtime.recoveredMinutes)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="eyebrow text-primary">Uitbetaald</p>
                  <p className="text-lg font-mono">{formatMinutes(overtime.paidMinutes)}</p>
                </div>
              </div>

              <div className="mb-5 border-y border-border/60 py-4">
                <div className="mb-3 flex items-center gap-2">
                  <Info className="h-4 w-4 text-primary" />
                  <p className="eyebrow text-primary">Opbouw van het saldo</p>
                </div>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Startdatum dossier</dt>
                    <dd className="font-medium">{overtime.startDate ? formatDate(overtime.startDate) : "Niet ingevuld"}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Meetperiode</dt>
                    <dd className="text-right font-medium">
                      {overtime.measurementStart && overtime.measurementEnd
                        ? `${formatDate(overtime.measurementStart)} – ${formatDate(overtime.measurementEnd)}`
                        : "Nog geen afgesloten weken"}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Geregistreerde werkdagen</dt>
                    <dd className="font-mono font-medium">{overtime.registeredWorkdays}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Gewerkte uren</dt>
                    <dd className="font-mono font-medium">{formatMinutes(overtime.totalWorkedMinutes)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Verwachte contracturen</dt>
                    <dd className="font-mono font-medium">− {formatMinutes(overtime.totalExpectedMinutes)}</dd>
                  </div>
                  {overtime.extraMinutes > 0 && <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Eenmalig toegevoegde uren</dt>
                    <dd className="font-mono font-medium">+ {formatMinutes(overtime.extraMinutes)}</dd>
                  </div>}
                  {overtime.deficitMinutes > 0 && <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Tekorten in korte weken</dt>
                    <dd className="font-mono font-medium text-muted-foreground">{formatMinutes(overtime.deficitMinutes)} (niet verrekend)</dd>
                  </div>}
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Opgenomen recuperatie</dt>
                    <dd className="font-mono font-medium">− {formatMinutes(overtime.recoveredMinutes)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">Uitbetaalde overuren</dt>
                    <dd className="font-mono font-medium">− {formatMinutes(overtime.paidMinutes)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-2 sm:col-span-2">
                    <dt className="font-semibold">Berekend saldo</dt>
                    <dd className="font-mono font-semibold text-primary">{formatMinutes(overtime.balanceMinutes)}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">
                  Alleen weken met méér uren dan je contract bouwen overuren op. Weken met minder uren tellen niet in mindering: je bouwt geen schuld op. Daarvan af: opgenomen recuperatie en uitbetaalde overuren. Bij een variabel weekrooster telt een positief overschot van de lopende week meteen mee.
                </p>
              </div>

              <p className="eyebrow text-primary mb-2">Per week (contract {overtime.weeklyHours} u/week)</p>
              <p className="mb-3 text-xs text-muted-foreground">{overtime.calculationMode === "weekly" ? "Variabel rooster: alleen het totaal per afgesloten week wordt berekend." : overtime.usesPersonalSchedule ? "Berekend volgens het persoonlijke dagrooster." : "Geen dagrooster ingevuld: de weekuren zijn gelijk verdeeld over maandag tot vrijdag."}</p>
              {overtime.weeks.length === 0 ? (
                <p className="text-sm text-muted-foreground mb-5">Nog geen afgesloten werkuren gevonden.</p>
              ) : (
                <ul className="divide-y mb-5 text-sm">
                  {overtime.weeks.map((w) => (
                    <li key={w.weekStart} className="py-3">
                      <Collapsible>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="h-auto w-full justify-between px-0 py-0 text-left">
                            <span className="flex items-center gap-2 font-medium"><Clock className="h-4 w-4 shrink-0 text-primary" /> Week van {formatDate(w.weekStart)}</span>
                            <span className="flex items-center gap-2">{w.isCurrentWeek && <span className="text-xs font-semibold uppercase text-muted-foreground">Voorlopig</span>}<ChevronDown className="h-4 w-4" /></span>
                          </Button>
                        </CollapsibleTrigger>
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 pl-6 text-xs text-muted-foreground sm:grid-cols-4">
                          <span>{w.registeredWorkdays} werkdagen</span>
                          <span>Gewerkt <strong className="font-mono text-foreground">{formatMinutes(w.workedMinutes)}</strong></span>
                          <span>Verwacht <strong className="font-mono text-foreground">{formatMinutes(w.expectedMinutes)}</strong></span>
                          <span>Verschil <strong className={w.diffMinutes >= 0 ? "font-mono text-primary" : "font-mono text-foreground"}>{w.diffMinutes >= 0 ? "+" : ""}{formatMinutes(w.diffMinutes)}</strong></span>
                           {(w.recoveredMinutes > 0 || w.paidMinutes > 0 || w.extraMinutes > 0) && <span className="sm:col-span-4">{w.extraMinutes > 0 && <>Eenmalig toegevoegd <strong className="font-mono text-foreground">{formatMinutes(w.extraMinutes)}</strong> · </>}Teruggenomen <strong className="font-mono text-foreground">{formatMinutes(w.recoveredMinutes)}</strong> · uitbetaald <strong className="font-mono text-foreground">{formatMinutes(w.paidMinutes)}</strong> · open <strong className="font-mono text-primary">{formatMinutes(w.openMinutes)}</strong></span>}
                        </div>
                         {overtime.calculationMode === "daily" && <CollapsibleContent className="mt-3 ml-6 border-l border-border/60 pl-3">
                          {w.days.map((day) => <div key={day.date} className="grid grid-cols-[1fr_auto] gap-x-3 border-b border-border/40 py-2 text-xs last:border-0">
                            <span className="font-medium capitalize">{formatDay(day.date)}</span>
                            <span className={day.diffMinutes >= 0 ? "font-mono text-primary" : "font-mono"}>{day.diffMinutes >= 0 ? "+" : ""}{formatMinutes(day.diffMinutes)}</span>
                            <span className="text-muted-foreground">Gewerkt {formatMinutes(day.workedMinutes)} · gepland {formatMinutes(day.expectedMinutes)}</span>
                          </div>)}
                         </CollapsibleContent>}
                      </Collapsible>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <p className="eyebrow text-primary mb-2">Mijn aanvragen</p>
          {data.requests.length === 0 ? (
            <p className="text-sm text-muted-foreground mb-5">Je hebt nog geen vakantie of recuperatie aangevraagd.</p>
          ) : (
            <ul className="divide-y mb-5 text-sm">
              {data.requests.map((r) => (
                <li key={r.id} className="py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" /> {typeLabel(r.request_type)}
                    </span>
                    <span className="text-xs uppercase font-semibold">{statusLabel(r.status)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatDate(r.starts_on)} t/m {formatDate(r.ends_on)}
                    {r.hours != null ? ` · ${Number(r.hours)} u` : ""}
                    {r.note ? ` · ${r.note}` : ""}
                  </div>
                  {r.review_note && <div className="text-xs italic">Reactie: {r.review_note}</div>}
                  {r.status === "pending" && (
                    <Button variant="ghost" size="sm" className="mt-1 px-0" disabled={busy} onClick={() => handleCancel(r.id)}>
                      Intrekken
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 border-t border-border/60 pt-4">
            <p className="eyebrow text-primary">Nieuwe aanvraag</p>
            <div>
              <Label>Soort aanvraag</Label>
              <Select value={requestType} onValueChange={setRequestType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_REQUEST_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="leave-start">Van</Label>
                <Input id="leave-start" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="leave-end">Tot en met</Label>
                <Input id="leave-end" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
              </div>
            </div>
            {requestType === "overtime_recovery" && (
              <div>
                <Label htmlFor="leave-hours">Aantal uren op te nemen</Label>
                <Input
                  id="leave-hours"
                  type="text"
                  inputMode="decimal"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                  placeholder="bv. 7,6"
                />
              </div>
            )}
            <div>
              <Label htmlFor="leave-note">Toelichting (optioneel)</Label>
              <Textarea id="leave-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleSubmit} disabled={busy}>
              <Send className="h-4 w-4 mr-2" /> Aanvraag versturen
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
