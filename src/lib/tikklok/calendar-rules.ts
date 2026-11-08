import { addMonths, addYears, differenceInCalendarDays, differenceInCalendarMonths, differenceInCalendarYears, format, parseISO } from 'date-fns';

export type CalendarEvent = { id: string; title: string; body: string; event_date: string; employee_id: string | null; notify_all: boolean; popup_enabled: boolean; recurrence_unit?: string; recurrence_interval?: number; recurrence_until?: string | null };
export type BirthdayPerson = { id: string; name: string; birth_date: string | null };
export type CalendarNotice = { key: string; date: string; title: string; body: string; birthday: boolean; forAll: boolean };

export function brusselsDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function birthdayOn(birthDate: string | null, year: number) {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const monthDay = birthDate.slice(5);
  // A leap-day birthday remains on its actual date; no invented birthday.
  if (monthDay === '02-29' && new Date(Date.UTC(year, 1, 29)).getUTCMonth() !== 1) return null;
  return `${year}-${monthDay}`;
}

export function eventOccursOn(event: CalendarEvent, day: string): boolean {
  if (day < event.event_date || (event.recurrence_until && day > event.recurrence_until)) return false;
  const unit = event.recurrence_unit ?? 'none';
  if (unit === 'none') return day === event.event_date;
  const interval = event.recurrence_interval ?? 1;
  if (!Number.isInteger(interval) || interval < 1) return false;
  const start = parseISO(event.event_date);
  const target = parseISO(day);
  if (unit === 'daily' || unit === 'weekly') return differenceInCalendarDays(target, start) % (interval * (unit === 'weekly' ? 7 : 1)) === 0;
  if (unit === 'monthly') {
    const months = differenceInCalendarMonths(target, start);
    return months % interval === 0 && format(addMonths(start, months), 'yyyy-MM-dd') === day;
  }
  if (unit === 'yearly') {
    const years = differenceInCalendarYears(target, start);
    return years % interval === 0 && format(addYears(start, years), 'yyyy-MM-dd') === day;
  }
  return false;
}

export function recurrenceLabel(event: CalendarEvent) {
  const names: Record<string, [string, string]> = { daily: ['dag', 'dagen'], weekly: ['week', 'weken'], monthly: ['maand', 'maanden'], yearly: ['jaar', 'jaar'] };
  const name = names[event.recurrence_unit ?? 'none'];
  if (!name) return 'Eenmalig';
  const interval = event.recurrence_interval ?? 1;
  return `Elke ${interval === 1 ? name[0] : `${interval} ${name[1]}`}${event.recurrence_until ? ` · tot en met ${event.recurrence_until}` : ''}`;
}

export function noticesForDay(events: CalendarEvent[], people: BirthdayPerson[], employeeId: string, today: string, birthdayNotifyAll: boolean, readKeys: string[] = []): CalendarNotice[] {
  const read = new Set(readKeys);
  const notices: CalendarNotice[] = events
    .filter(e => e.popup_enabled && eventOccursOn(e, today) && (e.notify_all || e.employee_id === employeeId))
    .map(e => ({ key: `event:${e.id}`, date: today, title: e.title, body: e.body, birthday: false, forAll: e.notify_all }));
  for (const p of people) {
    if (birthdayOn(p.birth_date, Number(today.slice(0, 4))) !== today || (!birthdayNotifyAll && p.id !== employeeId)) continue;
    notices.push({ key: `birthday:${p.id}`, date: today, title: p.id === employeeId ? `Gelukkige verjaardag, ${p.name}!` : `${p.name} is jarig!`, body: p.id === employeeId ? 'Het hele Riory-team wenst je een fantastische verjaardag!' : `Een feestelijke dag voor ${p.name}. Gelukkige verjaardag namens het Riory-team!`, birthday: true, forAll: birthdayNotifyAll });
  }
  return notices.filter(n => !read.has(n.key));
}