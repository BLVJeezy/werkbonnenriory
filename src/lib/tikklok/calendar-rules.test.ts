import { describe, expect, it } from 'vitest';
import { brusselsDate, eventOccursOn, noticesForDay, type CalendarEvent } from './calendar-rules';
const event: CalendarEvent = { id: '1', title: 'Afspraak', body: '', event_date: '2026-10-22', employee_id: 'a', notify_all: false, popup_enabled: true };
describe('kalendermeldingen', () => {
  it('herhaalt elke twee weken vanaf de startdatum', () => {
    const recurring = { ...event, recurrence_unit: 'weekly', recurrence_interval: 2 };
    expect(eventOccursOn(recurring, '2026-10-08')).toBe(false);
    expect(eventOccursOn(recurring, '2026-10-29')).toBe(false);
    expect(eventOccursOn(recurring, '2026-11-05')).toBe(true);
  });
  it('herhaalt dagelijks met een instelbare periode', () => {
    const recurring = { ...event, recurrence_unit: 'daily', recurrence_interval: 3 };
    expect(eventOccursOn(recurring, '2026-10-24')).toBe(false);
    expect(eventOccursOn(recurring, '2026-10-25')).toBe(true);
  });
  it('herhaalt maandelijks op de datum of de laatste dag van een kortere maand', () => {
    const recurring = { ...event, event_date: '2026-01-31', recurrence_unit: 'monthly' };
    expect(eventOccursOn(recurring, '2026-02-28')).toBe(true);
    expect(eventOccursOn(recurring, '2026-03-28')).toBe(false);
    expect(eventOccursOn(recurring, '2026-03-31')).toBe(true);
  });
  it('herhaalt jaarlijks', () => {
    expect(eventOccursOn({ ...event, recurrence_unit: 'yearly' }, '2027-10-22')).toBe(true);
    expect(eventOccursOn({ ...event, recurrence_unit: 'yearly' }, '2027-10-23')).toBe(false);
  });
  it('stopt na de gekozen einddatum inclusief', () => {
    const recurring = { ...event, recurrence_unit: 'daily', recurrence_until: '2026-10-24' };
    expect(eventOccursOn(recurring, '2026-10-24')).toBe(true);
    expect(eventOccursOn(recurring, '2026-10-25')).toBe(false);
  });
  it('vraagt bij iedere herhaaldag opnieuw een bevestiging aan de juiste werknemer', () => {
    const recurring = { ...event, recurrence_unit: 'weekly' };
    expect(noticesForDay([recurring], [], 'a', '2026-10-29', false)).toHaveLength(1);
    expect(noticesForDay([recurring], [], 'b', '2026-10-29', false)).toHaveLength(0);
    expect(noticesForDay([recurring], [], 'a', '2026-10-29', false, ['event:1'])).toHaveLength(0);
    expect(noticesForDay([recurring], [], 'a', '2026-11-05', false)).toHaveLength(1);
  });
  it('toont een gebeurtenis uitsluitend op de dag zelf', () => {
    expect(noticesForDay([event], [], 'a', '2026-10-21', false)).toHaveLength(0);
    expect(noticesForDay([event], [], 'a', '2026-10-22', false)).toHaveLength(1);
  });
  it('richt de melding op de betrokken werknemer', () => {
    expect(noticesForDay([event], [], 'b', '2026-10-22', false)).toHaveLength(0);
    expect(noticesForDay([event], [], 'a', '2026-10-22', false)).toHaveLength(1);
  });
  it('kan naar iedereen worden verstuurd', () => {
    expect(noticesForDay([{ ...event, notify_all: true }], [], 'b', '2026-10-22', false)).toHaveLength(1);
  });
  it('leest verjaardagen automatisch uit de geboortedatum', () => {
    const people = [{ id: 'a', name: 'Anna', birth_date: '1998-10-22' }];
    expect(noticesForDay([], people, 'a', '2026-10-22', false)[0]?.birthday).toBe(true);
    expect(noticesForDay([], people, 'b', '2026-10-22', false)).toHaveLength(0);
    expect(noticesForDay([], people, 'b', '2026-10-22', true)).toHaveLength(1);
  });
  it('onthoudt een bevestiging voor die dag', () => {
    expect(noticesForDay([event], [], 'a', '2026-10-22', false, ['event:1'])).toHaveLength(0);
  });
  it('gebruikt de Belgische kalenderdag, ook rond middernacht', () => {
    expect(brusselsDate(new Date('2026-10-21T22:10:00Z'))).toBe('2026-10-22');
  });
});