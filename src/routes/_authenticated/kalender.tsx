import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRole } from "@/lib/use-role";
import { quoteFromTask } from "@/lib/quotes.functions";
import { importFromMailbox } from "@/lib/mailbox.functions";
import { TaskCreateDialog } from "@/components/TaskCreateDialog";
import { CrewTasks } from "@/components/CrewTasks";
import { MailboxConnect, WerkbonMailboxConnect } from "@/components/MailboxConnect";
import { TaskActions, isNoAnswer } from "@/components/TaskActions";
import { destinationAddress } from "@/lib/address";
import { sortRows, type SortDir } from "@/lib/sort-rows";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteTask } from "@/lib/delete-task";
import { werkbonNr } from "@/lib/werkbon-number";
import { isFullyPlanned } from "@/lib/planning";
import { VAT_RATES, euro, workOrderRevenue } from "@/lib/billing";
import { crewStyle } from "@/lib/crew-color";
import type { Database } from "@/integrations/supabase/types";
import { RunningTask } from "@/components/RunningTask";
import type { TimeEntry } from "@/lib/time";
import { activeTimeEntry, totalSeconds } from "@/lib/time";
import { isUrgentOpen, URGENT_RING } from "@/lib/urgent";
import { taskListRows } from "@/lib/task-list";
import { destinationLabel, destinationLines } from "@/lib/address";
import { AppointmentMailSync } from "@/components/AppointmentMailSync";
import { CustomerInvite } from "@/components/CustomerInvite";
import { dayPartLabel } from "@/lib/invite-slots";
import { appointmentStatuses } from "@/lib/appointments";
import { X, FilePenLine, Plus } from "lucide-react";
import { FirstCustomerLabel } from "@/components/FirstCustomerLabel";
import { calendarWindow } from "@/lib/calendar-window";

export const Route = createFileRoute("/_authenticated/kalender")({
  head: () => ({ meta: [{ title: "Kalender — Riory" }, { name: "description", content: "Plan Riory-taken per dag en wijs ploegen en activiteiten toe." }, { property: "og:title", content: "Kalender — Riory" }, { property: "og:description", content: "Plan Riory-taken per dag en wijs ploegen en activiteiten toe." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  validateSearch: (s: Record<string, unknown>): { dag?: string } => typeof s["dag"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s["dag"]) ? { dag: s["dag"] } : {},
  component: Kalender,
});

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

type Row = Database["public"]["Tables"]["work_orders"]["Row"] & { technicians: { name: string; color: string | null; manual_time_entry: boolean | null } | null; time_entries: (TimeEntry & { id: string })[]; materials: { quantity: number; unit_price: number }[] };

function Kalender() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const role = useRole();
  const makeQuote = useServerFn(quoteFromTask);
  const runImport = useServerFn(importFromMailbox);
  const { dag } = Route.useSearch();
  const [create, setCreate] = useState<{ day?: string; direct?: boolean } | null>(dag ? { day: dag } : null);
  const [quotingId, setQuotingId] = useState<string | null>(null);
  const [crewView, setCrewView] = useState("");
  const [search, setSearch] = useState("");
  const [taskSort, setTaskSort] = useState("nieuwste");
  const [taskDir, setTaskDir] = useState<SortDir>("desc");
  const [onlyRunning, setOnlyRunning] = useState(false);
  const { error: importError, isFetching: importing, refetch: fetchMail } = useQuery({
    queryKey: ["task-mail-import"], enabled: role === "admin", retry: false,
    staleTime: 5 * 60_000, refetchInterval: 5 * 60_000,
    queryFn: async () => {
      const result = await runImport();
      if (result.imported) { toast.success(`${result.imported} nieuwe taken bij Nog in te plannen`); await Promise.all([qc.invalidateQueries({ queryKey: ["work_orders"] }), qc.invalidateQueries({ queryKey: ["customers"] })]); }
      if (result.errors?.length) throw new Error(`${result.errors.length} afspraakmails konden niet gelezen worden: ${result.errors[0]}`);
      return result;
    },
  });
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  const [drag, setDrag] = useState<string | null>(null);
  const { data = [] } = useQuery({
    queryKey: ["work_orders", "calendar"],
    refetchInterval: 10000,
    enabled: role === "admin" || role === "technician",
    queryFn: async () =>
      taskListRows((await supabase.from("work_orders").select("*, technicians(name, color, manual_time_entry), time_entries(id, started_at, ended_at), materials(quantity, unit_price)").neq("status", "offerte").eq("quote_pending", false).order("sort_order").order("number")).data ?? []) as Row[],
  });
  const { data: opts } = useQuery({
    queryKey: ["calendar_assign_opts"],
    enabled: role === "admin",
    queryFn: async () => {
      const [t, a, s] = await Promise.all([
        supabase.from("technicians").select("id, name").order("name"),
        supabase.from("activities").select("id, name, hourly_rate").order("name"),
        supabase.from("settings").select("km_rate").eq("id", 1).single(),
      ]);
      return { techs: t.data ?? [], acts: a.data ?? [], kmRate: Number(s.data?.km_rate ?? 0) };
    },
  });
  // Open uitnodigingen: de tabel is alleen voor de beheerder leesbaar, dus ploegen zien hier niets.
  const { data: appts = [] } = useQuery({
    queryKey: ["appointment_requests"],
    enabled: role === "admin",
    refetchInterval: 10000,
    queryFn: async () => (await supabase.from("appointment_requests").select("work_order_id,status,expires_at,created_at").order("created_at", { ascending: false })).data ?? [],
  });
  const waiting = new Map<string, string>();
  for (const a of appts) if (!waiting.has(a.work_order_id) && Date.parse(a.expires_at) >= Date.now()) waiting.set(a.work_order_id, a.status);
  // Status van een uitnodiging die nog op de klant of de ploeg wacht; leeg als alles bevestigd is.
  const waitingLabel = (id: string) => {
    const s = waiting.get(id);
    return s && s !== "confirmed" ? appointmentStatuses[s] ?? s : "";
  };
  async function set(id: string, patch: Database["public"]["Tables"]["work_orders"]["Update"]) {
    const { error } = await supabase.from("work_orders").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["work_orders"] });
  }
  const sel = "mt-1 h-7 w-full min-w-0 rounded border bg-background px-1 text-xs text-foreground";
  const days = calendarWindow(now, offset);
  const today = iso(now);

  // Alleen volledig ingeplande taken (dag + ploeg + activiteit) verschijnen op de dag; afgetekende blijven op hun dag staan.
  const visible = data.filter(w => (!search || [w.customer_name, w.number, w.description, destinationAddress(w), w.phone, w.site_contact_name].join(" ").toLocaleLowerCase("nl-BE").includes(search.toLocaleLowerCase("nl-BE"))) && (!onlyRunning || activeTimeEntry(w.time_entries)));
  const dayList = (k: string) => visible.filter((w) => w.scheduled_date === k && (w.status === "afgetekend" || isFullyPlanned(w)));
  // Dagomzet: enkel afgewerkte bonnen — betaald bedrag, of het berekende totaal als er nog geen betaling is.
  const dayOmzet = (k: string) =>
    dayList(k)
      .filter((w) => w.status === "afgetekend")
      .reduce(
        (s, w) =>
          s +
          workOrderRevenue({
            paidAmount: w.paid_amount == null ? null : Number(w.paid_amount),
            seconds: totalSeconds(w.time_entries, Date.now()),
            hourlyRate: Number(opts?.acts.find((a) => a.id === w.activity_id)?.hourly_rate ?? 0),
            distanceKm: w.distance_km == null ? null : Number(w.distance_km),
            kmRate: opts?.kmRate ?? 0,
            materials: w.materials.map((m) => ({ quantity: Number(m.quantity), unit_price: Number(m.unit_price) })),
            vatRate: Number(w.vat_rate),
            warranty: w.warranty,
          }),
        0,
      );
  async function move(list: Row[], i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    const current = next[i]; const other = next[j];
    if (!current || !other) return;
    [next[i], next[j]] = [other, current];
    await Promise.all(next.map((w, n) => supabase.from("work_orders").update({ sort_order: n + 1 }).eq("id", w.id)));
    qc.invalidateQueries({ queryKey: ["work_orders"] });
  }
  async function plan(id: string, date: string | null) {
    if (date) {
      const end = Math.max(0, ...dayList(date).filter((w) => w.id !== id).map((w) => w.sort_order)) + 1;
      const { error } = await supabase.from("work_orders").update({ scheduled_date: date, sort_order: end }).eq("id", id);
      if (error) toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["work_orders"] });
      return;
    }
    const { error } = await supabase.from("work_orders").update({ scheduled_date: date }).eq("id", id);
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["work_orders"] });
  }
  const shift = (n: number) => setOffset((s) => s + n);
  const drop = (date: string | null) => ({
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: () => { if (drag) plan(drag, date); setDrag(null); },
  });
  const card = (w: Row, i?: number, list?: Row[], horizontal = false) => w.status === "afgetekend" ? (
    <div key={w.id} style={crewStyle(w.technicians?.color)} className="min-w-0 rounded border bg-background px-2 py-1 text-xs opacity-75">
      <div className="flex items-center gap-1">
        <span className="rounded bg-foreground px-1 font-bold text-background">Afgewerkt</span>
        <Link to="/werkbonnen/$id" params={{ id: w.id }} className="min-w-0 flex-1 truncate font-bold underline">{werkbonNr(w.number)} {w.customer_name}</Link>
      </div>
      <p className="break-words opacity-80">{[w.scheduled_from && `${w.scheduled_from.slice(0,5)}–${w.scheduled_until?.slice(0,5) ?? ""}`, destinationLines(w).join(", ") || "Geen adres", w.technicians?.name].filter(Boolean).join(" · ")}</p>
    </div>
  ) : (
    <div key={w.id} draggable onPointerDown={(e) => { e.currentTarget.draggable = !(e.target as HTMLElement).closest("input,select,button,a,textarea"); }} onDragStart={() => setDrag(w.id)} style={crewStyle(w.technicians?.color)} className={`relative min-w-0 cursor-grab rounded border bg-background p-3 text-sm ${horizontal ? "grid gap-x-5 gap-y-2 lg:grid-cols-[minmax(0,1fr)_20rem]" : ""} ${isUrgentOpen(w) ? URGENT_RING : ""} ${activeTimeEntry(w.time_entries) ? "task-running" : ""}`}>
      <div className="min-w-0">
      {w.first_customer && <div className="mb-1"><FirstCustomerLabel /></div>}
      {w.quote_approved && <span className="mb-1 inline-block rounded bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">Offerte goedgekeurd</span>}
      {horizontal && w.scheduled_date && !isFullyPlanned(w) && <p className="mb-1 text-xs font-bold"><span className="rounded bg-background px-1 text-destructive">{w.contract_id ? "Nog niet volledig ingepland — vul dag en ploeg in" : "Nog niet volledig ingepland — vul dag, ploeg én activiteit in"}</span></p>}
      {(isUrgentOpen(w) || w.contract_id || dayPartLabel(w.scheduled_from) || waitingLabel(w.id)) && <div className="mb-1 flex flex-wrap gap-1 text-xs font-bold">{isUrgentOpen(w) && <span className="animate-pulse rounded bg-background px-1 text-destructive ring-1 ring-destructive">DRINGEND</span>}{w.contract_id && <span className="rounded bg-secondary px-1 text-secondary-foreground">Contract</span>}{dayPartLabel(w.scheduled_from) && <span className="rounded bg-primary px-1 text-primary-foreground">{dayPartLabel(w.scheduled_from)}</span>}{waitingLabel(w.id) && <span className="rounded border bg-background px-1 text-foreground">{waitingLabel(w.id)}</span>}</div>}
      <div className="flex items-start gap-1">
        <Link to="/werkbonnen/$id" params={{ id: w.id }} className="flex-1 font-bold underline">{werkbonNr(w.number)} {w.customer_name}{w.project_name ? ` · ${w.project_name}` : ""}</Link>
        <Button type="button" size="icon" variant="ghost" title="Verwijderen" aria-label="Taak verwijderen" className="h-7 w-7 shrink-0" onClick={() => deleteTask(qc, w.id, `Taak ${werkbonNr(w.number)} (${w.customer_name})`)}><X /></Button>
      </div>
      {w.no_invoice && <span className="rounded bg-secondary px-1 text-xs font-bold text-secondary-foreground">Niet factureren</span>}
      {isNoAnswer(w.no_answer_at) && <p className="text-xs font-bold">Neemt niet op · {new Date(w.no_answer_at ?? "").toLocaleString("nl-BE")}</p>}
      {w.reopened_at && <p className="text-xs font-bold">Heropend — opnieuw laten aftekenen</p>}
      <RunningTask entries={w.time_entries} crewName={w.technicians?.name} />
      {w.scheduled_from && <p className="font-bold">{w.scheduled_from.slice(0,5)}–{w.scheduled_until?.slice(0,5)}</p>}
      {!horizontal && <div className="flex items-start gap-1 text-xs opacity-90">
        {list && i !== undefined && <span className="font-mono font-bold">{i + 1}.</span>}
        <span className="min-w-0 flex-1 break-words">{destinationLabel(w)}: {destinationLines(w).join(", ") || "Geen adres ingevuld"}</span>
        {list && i !== undefined && (
          <>
            <Button type="button" variant="ghost" size="icon" title="Eerder" disabled={i === 0} className="h-6 w-6" onClick={() => move(list, i, -1)}>▲</Button>
            <Button type="button" variant="ghost" size="icon" title="Later" disabled={i === list.length - 1} className="h-6 w-6" onClick={() => move(list, i, 1)}>▼</Button>
          </>
        )}
      </div>}
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-snug">{w.description || "Geen omschrijving"}</p>
      {horizontal && <>
        <p className="mt-2 font-medium">{destinationLabel(w)}: {destinationLines(w).join(" · ") || "Niet ingevuld"}</p>
        {(w.site_contact_name || w.phone || w.site_contact_phone) && <p className="mt-2 text-xs opacity-80">{[w.site_contact_name, w.site_contact_phone, w.phone && `Klant: ${w.phone}`].filter(Boolean).join(" · ")}</p>}
      </>}
      </div>
      <div className={horizontal ? "grid min-w-0 content-start gap-2 sm:grid-cols-2" : "grid min-w-0 grid-cols-2 gap-1.5 sm:grid-cols-4"}>
      <Input key={w.scheduled_date ?? "none"} type="date" aria-label={`Dag taak ${w.number ?? "nieuw"}`} className="mt-0 h-7 bg-background text-xs text-foreground" defaultValue={w.scheduled_date ?? ""} onChange={(e) => { const v = e.target.value || null; if (v !== (w.scheduled_date ?? null)) plan(w.id, v); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
      <select aria-label={`Ploeg taak ${w.number ?? "nieuw"}`} className={sel} value={w.technician_id ?? ""} onChange={(e) => set(w.id, { technician_id: e.target.value || null, status: e.target.value ? "toegewezen" : "nieuw" })}>
        <option value="">— Ploeg —</option>
        {opts?.techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <select aria-label={`Activiteit taak ${w.number ?? "nieuw"}`} className={sel} value={w.activity_id ?? ""} onChange={(e) => set(w.id, { activity_id: e.target.value || null })}>
        <option value="">— Activiteit —</option>
        {opts?.acts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <select className={sel} value={String(Number(w.vat_rate))} onChange={(e) => set(w.id, { vat_rate: Number(e.target.value) })}>
        {VAT_RATES.map((r) => <option key={r} value={r}>Btw {r}%</option>)}
      </select>
      <div className="col-span-full flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={quotingId !== null} onClick={async () => {
          setQuotingId(w.id);
          try { const q = await makeQuote({ data: { workOrderId: w.id } }); await Promise.all([qc.invalidateQueries({ queryKey: ["quotes"] }), qc.invalidateQueries({ queryKey: ["work_orders"] })]); toast.success(`Offerte ${q.number} aangemaakt`); await navigate({ to: "/offertes", search: { bewerk: q.id } }); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Offerte maken mislukt"); } finally { setQuotingId(null); }
        }}><FilePenLine />{quotingId === w.id ? "Offerte maken…" : "Omzetten naar offerte"}</Button>
        <Button type="button" size="sm" variant={w.no_invoice ? "secondary" : "outline"} className="h-8 text-xs" onClick={() => set(w.id, { no_invoice: !w.no_invoice })}>{w.no_invoice ? "Niet factureren ✓" : "Niet factureren"}</Button>
      </div>
      <div className="col-span-full flex flex-wrap items-center gap-2"><Button type="button" size="sm" variant={w.urgent ? "destructive" : "outline"} aria-pressed={!!w.urgent} title="Markeer deze taak als dringend" className="h-7 shrink-0 text-xs" onClick={() => set(w.id, { urgent: !w.urgent })}>{w.urgent ? "Dringend ✓" : "Dringend"}</Button><label className="flex cursor-pointer items-center gap-1.5 text-xs font-bold"><input type="checkbox" className="accent-primary" checked={w.first_customer} onChange={(e) => set(w.id, { first_customer: e.target.checked })} />Eerste klant</label><CustomerInvite task={w} />{w.scheduled_date && <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => plan(w.id, null)}>Terug naar nog in te plannen</Button>}</div>
      <div className="col-span-full border-t pt-2 [&_button.absolute]:static"><TaskActions id={w.id} address={destinationAddress(w)} phone={w.phone} contactPhone={w.site_contact_phone} contactName={w.site_contact_name} runningEntryId={w.time_entries.find(t => !t.ended_at)?.id ?? null} manualTime={!!w.technicians?.manual_time_entry} noAnswerAt={w.no_answer_at} /></div>
      </div>
    </div>
  );
  const unplanned = sortRows(visible.filter((w) => w.status !== "afgetekend" && !isFullyPlanned(w)), w => taskSort === "klant" ? w.customer_name : taskSort === "plaats" ? w.site_city || w.city : taskSort === "datum" ? w.scheduled_date : w.created_at, taskDir).sort((a,b) => Number(isUrgentOpen(b)) - Number(isUrgentOpen(a)));
  if (!role) return <p className="text-muted-foreground">Laden…</p>;
  if (role === "technician") return <CrewTasks rows={data} />;
  if (role !== "admin") return null;
  const crewPicker = <label className="flex flex-wrap items-center gap-2 text-sm font-bold">Ploegweergave<select aria-label="Ploegweergave" className="h-9 rounded border bg-background px-2 text-foreground" value={crewView} onChange={e => setCrewView(e.target.value)}><option value="">Uit (beheer)</option>{opts?.techs.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>;
  if (crewView) return <div className="space-y-4">{crewPicker}<CrewTasks rows={data.filter(w => w.technician_id === crewView)} /></div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 items-center gap-2 sm:flex sm:flex-wrap">
        <h1 className="col-span-full min-w-0 text-3xl font-black uppercase sm:mr-auto">Kalender</h1>
        <Button variant="outline" size="sm" onClick={() => shift(-7)}>← Vorige week</Button>
        <Button variant="outline" size="sm" onClick={() => { setNow(new Date()); setOffset(0); }}>Vandaag</Button>
        <Button variant="outline" size="sm" onClick={() => shift(7)}>Volgende week →</Button>
      </div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setCreate({})}><Plus />Taak toevoegen</Button><Button variant="outline" onClick={() => setCreate({ direct: true })}><Plus />Werkbon maken</Button><Button disabled={importing} onClick={() => fetchMail()}>{importing ? "Mails lezen…" : "Mails ophalen"}</Button></div>
      <details className="border-b pb-2"><summary className="cursor-pointer text-sm font-bold">Mailboxen</summary><div className="space-y-2 pt-2"><MailboxConnect /><WerkbonMailboxConnect /></div></details>
      {importError && <p role="alert" className="text-sm text-destructive">{importError instanceof Error ? importError.message : "Afspraakmails ophalen mislukt"}</p>}
      {create && <TaskCreateDialog key={`${create.day ?? "nieuw"}-${!!create.direct}`} open day={create.day} direct={create.direct} onClose={() => { setCreate(null); if (dag) navigate({ to: "/kalender", search: {}, replace: true }); }} />}
      <AppointmentMailSync />
      <div className="flex flex-wrap gap-3">{crewPicker}<Input aria-label="Taken zoeken" placeholder="Klant, adres, omschrijving…" className="min-w-0 sm:max-w-xs" value={search} onChange={e => setSearch(e.target.value)} /><Button variant={onlyRunning ? "default" : "outline"} aria-pressed={onlyRunning} onClick={() => setOnlyRunning(!onlyRunning)}>Bezig ({data.filter(w => activeTimeEntry(w.time_entries)).length})</Button></div>
      <div className="grid gap-3 xl:grid-cols-[repeat(9,minmax(260px,1fr))] xl:overflow-x-auto xl:gap-2">
        {days.map((d) => {
          const k = iso(d);
          return (
            <div key={k} {...drop(k)} className={`min-w-0 space-y-2 overflow-hidden rounded-md border bg-card p-2 xl:min-h-40 ${k === today ? "border-2 border-primary" : ""}`}>
              <div className="-mx-2 -mt-2 flex items-center justify-between gap-1 rounded-t-md border-b bg-muted px-2 py-1.5 xl:mx-0 xl:mt-0 xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0">
                <span className="text-base font-black uppercase xl:text-sm">
                  {d.toLocaleDateString("nl-BE", { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <Button size="sm" variant="ghost" className="h-6 px-2" title="Taak aanmaken op deze dag" aria-label={`Taak toevoegen op ${k}`} onClick={() => setCreate({ day: k })}>+</Button>
              </div>
              {dayOmzet(k) > 0 && <p className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-black text-primary" title="Som van de afgewerkte bonnen van deze dag">Omzet: {euro(dayOmzet(k))}</p>}
              <div className="grid min-w-0 gap-2">
                {dayList(k).filter((w) => w.status !== "afgetekend").map((w, i, l) => card(w, i, l))}
                {dayList(k).filter((w) => w.status === "afgetekend").map((w) => card(w))}
                {dayList(k).length === 0 && <p className="text-xs text-muted-foreground">Geen taken</p>}
              </div>
            </div>
          );
        })}
      </div>
      <section {...drop(null)} className="space-y-3 border-t pt-4">
        <h2 className="mb-2 text-lg font-black uppercase">Nog in te plannen ({unplanned.length})</h2>
        <div className="flex flex-wrap gap-2"><select aria-label="Taken sorteren" className="h-9 rounded border bg-background px-2 text-sm text-foreground" value={taskSort} onChange={e => setTaskSort(e.target.value)}><option value="nieuwste">Ontvangstdatum</option><option value="klant">Klant</option><option value="plaats">Plaats</option><option value="datum">Geplande dag</option></select><Button size="sm" variant="outline" onClick={() => setTaskDir(taskDir === "asc" ? "desc" : "asc")}>{taskDir === "asc" ? "Oplopend ↑" : "Aflopend ↓"}</Button></div>
        {!unplanned.length && <p className="text-sm text-muted-foreground">Geen taken om in te plannen.</p>}
        <div className="grid gap-2">{unplanned.map((w) => card(w, undefined, undefined, true))}</div>
      </section>
      <Button variant="outline" asChild><Link to="/contracten">Contracten beheren</Link></Button>
    </div>
  );
}
