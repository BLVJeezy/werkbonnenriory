import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { requireApprovedDevice } from '@/lib/tikklok/device-access.server';
import { findEmployeeByPin, pinValidator } from '@/lib/tikklok/pin-access.server';
import { brusselsDate, noticesForDay, type CalendarEvent } from '@/lib/tikklok/calendar-rules';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Ongeldige datum');
const eventInput = z.object({ id: z.string().uuid().optional(), title: z.string().trim().min(1).max(120), body: z.string().trim().max(2000), event_date: date, employee_id: z.string().uuid().nullable(), notify_all: z.boolean(), popup_enabled: z.boolean(), recurrence_unit: z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly']).default('none'), recurrence_interval: z.number().int().min(1).max(365).default(1), recurrence_until: date.nullable().default(null) }).refine(v => v.notify_all || v.employee_id !== null, 'Kies een medewerker of iedereen').refine(v => !v.recurrence_until || v.recurrence_until >= v.event_date, 'De einddatum moet op of na de begindatum liggen');

export const getCalendar = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: allowed, error: roleError } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
  if (roleError || !allowed) throw new Error('Geen beheerdersrechten');
  const [events, profiles, employees, settings] = await Promise.all([
    context.supabase.from('tk_calendar_events').select('*').order('event_date'),
    context.supabase.from('tk_employee_profiles').select('employee_id, birth_date'),
    context.supabase.from('tk_employees').select('id, name, active').eq('active', true).order('name'),
    context.supabase.from('tk_calendar_settings').select('birthday_notify_all').maybeSingle(),
  ]);
  if (events.error || profiles.error || employees.error || settings.error) throw new Error('Kalender ophalen mislukt');
  return { today: brusselsDate(), events: events.data ?? [], people: (employees.data ?? []).map(e => ({ id: e.id, name: e.name, birth_date: profiles.data?.find(p => p.employee_id === e.id)?.birth_date ?? null })), birthdayNotifyAll: settings.data?.birthday_notify_all ?? false };
});

export const saveCalendarEvent = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((data: Omit<CalendarEvent, 'id'> & { id?: string }) => eventInput.parse(data)).handler(async ({ data, context }) => {
  const { data: allowed, error: roleError } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
  if (roleError || !allowed) throw new Error('Geen beheerdersrechten');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { id, ...values } = data;
  if (values.employee_id) {
    const { data: person } = await supabaseAdmin.from('tk_employees').select('id').eq('id', values.employee_id).eq('active', true).maybeSingle();
    if (!person) throw new Error('Medewerker niet gevonden');
  }
  const result = id ? await supabaseAdmin.from('tk_calendar_events').update(values).eq('id', id).select('id').single() : await supabaseAdmin.from('tk_calendar_events').insert({ ...values, created_by: context.userId }).select('id').single();
  if (result.error) throw new Error('Gebeurtenis opslaan mislukt');
  return { ok: true };
});

export const deleteCalendarEvent = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data)).handler(async ({ data, context }) => {
  const { data: allowed, error: roleError } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
  if (roleError || !allowed) throw new Error('Geen beheerdersrechten');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.from('tk_calendar_events').delete().eq('id', data.id);
  if (error) throw new Error('Verwijderen mislukt');
  return { ok: true };
});

export const saveBirthdayAudience = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator((data: { notifyAll: boolean }) => z.object({ notifyAll: z.boolean() }).parse(data)).handler(async ({ data, context }) => {
  const { data: allowed, error: roleError } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
  if (roleError || !allowed) throw new Error('Geen beheerdersrechten');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { error } = await supabaseAdmin.from('tk_calendar_settings').upsert({ id: true, birthday_notify_all: data.notifyAll });
  if (error) throw new Error('Instelling opslaan mislukt');
  return { ok: true };
});

async function employeeNotices(client: Awaited<ReturnType<typeof findEmployeeByPin>>['supabaseAdmin'], employeeId: string) {
  const today = brusselsDate();
  const [events, profile, settings, reads] = await Promise.all([
    client.from('tk_calendar_events').select('*').lte('event_date', today).eq('popup_enabled', true).or(`notify_all.eq.true,employee_id.eq.${employeeId}`),
    client.from('tk_employee_profiles').select('employee_id, birth_date').not('birth_date', 'is', null),
    client.from('tk_calendar_settings').select('birthday_notify_all').maybeSingle(),
    client.from('tk_calendar_notification_reads').select('notification_key').eq('employee_id', employeeId).eq('occurrence_date', today),
  ]);
  if (events.error || profile.error || settings.error || reads.error) throw new Error('Meldingen ophalen mislukt');
  const all = settings.data?.birthday_notify_all ?? false;
  const birthdayIds = (profile.data ?? []).filter(p => p.birth_date?.slice(5) === today.slice(5) && (all || p.employee_id === employeeId)).map(p => p.employee_id);
  const people = birthdayIds.length ? await client.from('tk_employees').select('id, name').in('id', birthdayIds).eq('active', true) : { data: [], error: null };
  if (people.error) throw new Error('Verjaardagen ophalen mislukt');
  return noticesForDay(events.data ?? [], (people.data ?? []).map(e => ({ ...e, birth_date: profile.data?.find(p => p.employee_id === e.id)?.birth_date ?? null })), employeeId, today, all, reads.data?.map(r => r.notification_key));
}

async function publicNotices(client: Awaited<ReturnType<typeof findEmployeeByPin>>['supabaseAdmin']) {
  const today = brusselsDate();
  const [events, profiles, settings] = await Promise.all([
    client.from('tk_calendar_events').select('*').lte('event_date', today).eq('popup_enabled', true).eq('notify_all', true),
    client.from('tk_employee_profiles').select('employee_id, birth_date').not('birth_date', 'is', null),
    client.from('tk_calendar_settings').select('birthday_notify_all').maybeSingle(),
  ]);
  if (events.error || profiles.error || settings.error) throw new Error('Meldingen ophalen mislukt');
  const all = settings.data?.birthday_notify_all ?? false;
  const birthdayIds = all ? (profiles.data ?? []).filter(p => p.birth_date?.slice(5) === today.slice(5)).map(p => p.employee_id) : [];
  const people = birthdayIds.length ? await client.from('tk_employees').select('id, name').in('id', birthdayIds).eq('active', true) : { data: [], error: null };
  if (people.error) throw new Error('Verjaardagen ophalen mislukt');
  return noticesForDay(events.data ?? [], (people.data ?? []).map(e => ({ ...e, birth_date: profiles.data?.find(p => p.employee_id === e.id)?.birth_date ?? null })), '', today, all).filter(n => n.forAll);
}

export const getPublicNotices = createServerFn({ method: 'POST' }).inputValidator((data: { deviceToken: string }) => z.object({ deviceToken: z.string().min(40).max(100) }).parse(data)).handler(async ({ data }) => {
  await requireApprovedDevice(data.deviceToken);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  return { notices: await publicNotices(supabaseAdmin) };
});

export const getMyCalendarNotices = createServerFn({ method: 'POST' }).inputValidator(pinValidator).handler(async ({ data }) => {
  await requireApprovedDevice(data.deviceToken);
  const { employee, supabaseAdmin } = await findEmployeeByPin(data.pin);
  return { notices: await employeeNotices(supabaseAdmin, employee.id) };
});

export const acknowledgeCalendarNotices = createServerFn({ method: 'POST' }).inputValidator((data: { pin: string; deviceToken: string; keys: string[] }) => ({ ...pinValidator(data), keys: z.array(z.string().max(100)).max(100).parse(data.keys) })).handler(async ({ data }) => {
  await requireApprovedDevice(data.deviceToken);
  const { employee, supabaseAdmin } = await findEmployeeByPin(data.pin);
  const current = await employeeNotices(supabaseAdmin, employee.id);
  const selected = current.filter(n => data.keys.includes(n.key));
  if (selected.length) {
    const { error } = await supabaseAdmin.from('tk_calendar_notification_reads').upsert(selected.map(n => ({ employee_id: employee.id, notification_key: n.key, occurrence_date: n.date })), { onConflict: 'employee_id,notification_key,occurrence_date' });
    if (error) throw new Error('Bevestigen mislukt');
  }
  return { ok: true };
});