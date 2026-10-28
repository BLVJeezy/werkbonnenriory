import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AppointmentSlots, emptySlot } from './AppointmentSlots';
import { appointmentSlotsInput, normalizeSlot, type AppointmentSlot } from '@/lib/appointments';

afterEach(cleanup);
function Form({ submit }: { submit: (slots: AppointmentSlot[]) => void }) {
  const [slots, setSlots] = useState([{ ...emptySlot }]);
  return <form onSubmit={e => { e.preventDefault(); const parsed = appointmentSlotsInput.safeParse(slots.map(normalizeSlot)); if (parsed.success) submit(parsed.data); }}>
    <AppointmentSlots slots={slots} onChange={setSlots} />
    <button type="submit">Versturen</button>
  </form>;
}
it('bewaart Belgische datum en uren bij invoeren en versturen van meerdere tijdsvakken', () => {
  let result: AppointmentSlot[] = [];
  render(<Form submit={slots => { result = slots; }} />);
  for (const [label, value] of [['Datum 1', '29-10-2026'], ['Vanaf 1', '12.30'], ['Tot 1', '14:30:00']] as const) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(value);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Tijdsvak toevoegen' }));
  for (const [label, value] of [['Datum 2', '30/10/2026'], ['Vanaf 2', '9u00'], ['Tot 2', '11:00']] as const) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.submit(screen.getByRole('button', { name: 'Versturen' }).closest('form') as HTMLFormElement);
  expect(result).toEqual([{ date: '2026-10-29', from: '12:30', until: '14:30' }, { date: '2026-10-30', from: '09:00', until: '11:00' }]);
});
it('verstuurt geen ontbrekend of achteruitlopend tijdsvak', () => {
  let count = 0;
  render(<Form submit={() => { count++; }} />);
  const form = screen.getByRole('button', { name: 'Versturen' }).closest('form') as HTMLFormElement;
  fireEvent.submit(form);
  expect(count).toBe(0);
  for (const [label, value] of [['Datum 1', '29-10-2026'], ['Vanaf 1', '14:00'], ['Tot 1', '12:00']] as const) fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.submit(form);
  expect(count).toBe(0);
});