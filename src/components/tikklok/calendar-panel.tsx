import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { nlBE } from 'date-fns/locale';
import { eachDayOfInterval, endOfMonth, format, startOfMonth, subDays, addDays } from 'date-fns';
import { Cake, Plus, Pencil, Trash2, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { getCalendar, saveCalendarEvent, deleteCalendarEvent, saveBirthdayAudience } from '@/lib/tikklok/calendar.functions';
import { birthdayOn, eventOccursOn, recurrenceLabel, type CalendarEvent } from '@/lib/tikklok/calendar-rules';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';

const emptyForm = { title: '', body: '', event_date: '', employee_id: null as string | null, notify_all: true, popup_enabled: true, recurrence_unit: 'none', recurrence_interval: 1, recurrence_until: null as string | null };
export function CalendarPanel() {
  const fetch = useServerFn(getCalendar);
  const save = useServerFn(saveCalendarEvent);
  const remove = useServerFn(deleteCalendarEvent);
  const audience = useServerFn(saveBirthdayAudience);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['tikklok:calendar'], queryFn: () => fetch({}) });
  const [selected, setSelected] = useState<Date>();
  const [month, setMonth] = useState<Date>();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<typeof emptyForm & { id?: string }>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  useEffect(() => {
    if (query.data && !selected) { const d = new Date(`${query.data.today}T12:00:00`); setSelected(d); setMonth(d); }
  }, [query.data, selected]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['tikklok:calendar'] });
  const saveM = useMutation({ mutationFn: () => save({ data: form }), onSuccess: () => { setOpen(false); void refresh(); toast.success('Gebeurtenis opgeslagen'); }, onError: (e: Error) => toast.error(e.message) });
  const deleteM = useMutation({ mutationFn: (id: string) => remove({ data: { id } }), onSuccess: () => { setDeleteId(null); void refresh(); }, onError: (e: Error) => toast.error(e.message) });
  const settingsM = useMutation({ mutationFn: (notifyAll: boolean) => audience({ data: { notifyAll } }), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  if (query.isPending) return <p className="text-muted-foreground">Kalender laden…</p>;
  if (query.error || !query.data) return <div><p className="text-destructive">{query.error?.message ?? 'Kalender niet beschikbaar'}</p><Button variant="outline" onClick={() => void query.refetch()}>Opnieuw proberen</Button></div>;
  const data = query.data;
  const day = selected ? format(selected, 'yyyy-MM-dd') : data.today;
  const year = (month ?? selected)?.getFullYear() ?? Number(data.today.slice(0, 4));
  const birthdays = data.people.map(p => ({ ...p, date: birthdayOn(p.birth_date, year) })).filter(p => p.date);
   const dayEvents = data.events.filter(e => eventOccursOn(e, day));
  const dayBirthdays = birthdays.filter(p => p.date === day);
   const visibleMonth = month ?? selected ?? new Date(`${data.today}T12:00:00`);
   const eventDays = eachDayOfInterval({ start: subDays(startOfMonth(visibleMonth), 7), end: addDays(endOfMonth(visibleMonth), 7) }).filter(d => data.events.some(e => eventOccursOn(e, format(d, 'yyyy-MM-dd'))));
   function edit(event?: CalendarEvent) { setForm(event ? { ...emptyForm, ...event } : { ...emptyForm, event_date: day }); setOpen(true); }
  return <section className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl">Kalender</h2><Button onClick={() => edit()}><Plus className="size-4 mr-2" />Gebeurtenis</Button></div>
    <div className="flex flex-wrap items-center gap-3 border-b pb-4"><Cake className="size-5 text-primary" /><Label htmlFor="birthday-all">Verjaardagsmelding aan iedereen</Label><Switch id="birthday-all" checked={data.birthdayNotifyAll} onCheckedChange={v => settingsM.mutate(v)} disabled={settingsM.isPending} /><span className="text-sm text-muted-foreground">{data.birthdayNotifyAll ? 'Iedereen ontvangt de felicitatie' : 'Alleen de jarige ontvangt de felicitatie'}</span></div>
    <div className="grid gap-8 md:grid-cols-[minmax(280px,380px)_1fr]">
      <Calendar mode="single" required locale={nlBE} weekStartsOn={1} selected={selected} onSelect={setSelected} month={month} onMonthChange={setMonth} className="w-full [--cell-size:2.5rem]" classNames={{ root: 'w-full' }} modifiers={{ event: eventDays, birthday: birthdays.map(p => new Date(`${p.date}T12:00:00`)) }} modifiersClassNames={{ event: 'calendar-event-day', birthday: 'calendar-birthday-day' }} />
      <div className="min-w-0"><h3 className="text-xl mb-4">{selected ? format(selected, 'EEEE d MMMM yyyy', { locale: nlBE }) : day}</h3>
        {!dayEvents.length && !dayBirthdays.length && <p className="text-muted-foreground text-sm">Geen gebeurtenissen op deze dag.</p>}
        <div className="divide-y">{dayBirthdays.map(p => <div key={p.id} className="py-4 flex items-start gap-3"><Cake className="size-5 text-primary shrink-0" /><div><p className="font-semibold">Verjaardag van {p.name}</p><p className="text-sm text-muted-foreground">{data.birthdayNotifyAll ? 'Melding aan iedereen' : 'Melding aan de jarige'}</p></div></div>)}
         {dayEvents.map(e => <div key={e.id} className="py-4 flex gap-3 items-start"><Bell className="size-5 text-primary shrink-0" /><div className="min-w-0 flex-1"><p className="font-semibold break-words">{e.title}</p><p className="text-sm whitespace-pre-wrap break-words mt-1">{e.body}</p><p className="text-xs text-muted-foreground mt-2">{e.notify_all ? 'Iedereen' : data.people.find(p => p.id === e.employee_id)?.name ?? 'Medewerker'} · {e.popup_enabled ? 'Pop-up aan' : 'Pop-up uit'} · {recurrenceLabel(e)}</p></div><Button size="icon" variant="ghost" aria-label={`Bewerk ${e.title}`} title="Bewerken" onClick={() => edit(e)}><Pencil className="size-4" /></Button><Button size="icon" variant="ghost" aria-label={`Verwijder ${e.title}`} title="Verwijderen" onClick={() => setDeleteId(e.id)}><Trash2 className="size-4" /></Button></div>)}</div>
      </div>
    </div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{form.id ? 'Gebeurtenis bewerken' : 'Nieuwe gebeurtenis'}</DialogTitle><DialogDescription>{form.event_date}</DialogDescription></DialogHeader>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); saveM.mutate(); }}>
        <div><Label htmlFor="event-title">Titel</Label><Input id="event-title" required maxLength={120} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
        <div><Label htmlFor="event-date">Datum</Label><Input id="event-date" type="date" required value={form.event_date} onChange={e => setForm({ ...form, event_date: e.target.value })} /></div>
         <div><Label>Herhalen</Label><Select value={form.recurrence_unit} onValueChange={v => setForm({ ...form, recurrence_unit: v, recurrence_until: v === 'none' ? null : form.recurrence_until })}><SelectTrigger aria-label="Herhalen"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Niet herhalen</SelectItem><SelectItem value="daily">Dagelijks</SelectItem><SelectItem value="weekly">Wekelijks</SelectItem><SelectItem value="monthly">Maandelijks</SelectItem><SelectItem value="yearly">Jaarlijks</SelectItem></SelectContent></Select></div>
         {form.recurrence_unit !== 'none' && <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="event-interval">Elke hoeveel {form.recurrence_unit === 'daily' ? 'dagen' : form.recurrence_unit === 'weekly' ? 'weken' : form.recurrence_unit === 'monthly' ? 'maanden' : 'jaar'}</Label><Input id="event-interval" type="number" min={1} max={365} required value={form.recurrence_interval || ''} onChange={e => setForm({ ...form, recurrence_interval: Number(e.target.value) })} /></div><div><Label htmlFor="event-until">Tot en met (optioneel)</Label><Input id="event-until" type="date" min={form.event_date} value={form.recurrence_until ?? ''} onChange={e => setForm({ ...form, recurrence_until: e.target.value || null })} /></div></div>}
        <div><Label htmlFor="event-body">Bericht</Label><Textarea id="event-body" maxLength={2000} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></div>
        <div><Label>Betrokken medewerker</Label><Select value={form.employee_id ?? '__all__'} onValueChange={v => setForm({ ...form, employee_id: v === '__all__' ? null : v, notify_all: v === '__all__' })}><SelectTrigger aria-label="Betrokken medewerker"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="__all__">Iedereen</SelectItem>{data.people.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
        {form.employee_id && <div className="flex items-center justify-between gap-3"><Label htmlFor="event-all">Pop-up aan iedereen</Label><Switch id="event-all" checked={form.notify_all} onCheckedChange={v => setForm({ ...form, notify_all: v })} /></div>}
        <div className="flex items-center justify-between gap-3"><Label htmlFor="event-popup">Pop-up op de dag zelf</Label><Switch id="event-popup" checked={form.popup_enabled} onCheckedChange={v => setForm({ ...form, popup_enabled: v })} /></div>
        <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Annuleren</Button><Button type="submit" disabled={saveM.isPending}>{saveM.isPending ? 'Opslaan…' : 'Opslaan'}</Button></DialogFooter>
      </form></DialogContent></Dialog>
    <Dialog open={!!deleteId} onOpenChange={v => { if (!v) setDeleteId(null); }}><DialogContent><DialogHeader><DialogTitle>Gebeurtenis verwijderen?</DialogTitle><DialogDescription>Deze gebeurtenis verdwijnt uit de kalender.</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" onClick={() => setDeleteId(null)}>Annuleren</Button><Button variant="destructive" disabled={deleteM.isPending} onClick={() => { if (deleteId) deleteM.mutate(deleteId); }}>Verwijderen</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}