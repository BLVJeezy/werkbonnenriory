import type { AppointmentSlot } from './appointments';

export type SlotPart = { key: string; label: string; from: string; until: string };

/** Standaardvakken die Riory voorlegt: een voormiddag- en een namiddagvak. */
export const SLOT_PARTS: SlotPart[] = [
  { key: 'voormiddag', label: 'Voormiddag', from: '08:00', until: '12:00' },
  { key: 'namiddag', label: 'Namiddag', from: '13:00', until: '17:00' },
];

/** Wat de beheerder bovenaan kiest: één deel van de dag, of beide. */
export type SlotChoice = 'voormiddag' | 'namiddag' | 'beide';

export const SLOT_CHOICES: { key: SlotChoice; label: string }[] = [
  { key: 'beide', label: 'Voormiddag én namiddag' },
  { key: 'voormiddag', label: 'Enkel voormiddag' },
  { key: 'namiddag', label: 'Enkel namiddag' },
];

/** De vakken die bij een keuze horen, in volgorde voormiddag dan namiddag. */
export function partsForChoice(choice: SlotChoice): SlotPart[] {
  return choice === 'beide' ? SLOT_PARTS : SLOT_PARTS.filter((p) => p.key === choice);
}

const DAY_NAMES = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Eerste `count` werkdagen (ma–vr) vanaf en met `start`, als ISO-datum. */
export function inviteDays(start: Date, count = 5): string[] {
  const out: string[] = [];
  const d = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  while (out.length < count) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) out.push(iso(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/** De voorgestelde vakken: het gekozen deel van de dag op elke voorgestelde dag. */
export function inviteSlots(dates: string[], choice: SlotChoice): AppointmentSlot[] {
  return dates.flatMap((date) => partsForChoice(choice).map((part) => ({ date, from: part.from, until: part.until })));
}

/** "di 29/10" */
export function inviteDayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

/** "di 29/10 · voormiddag 08:00–12:00" */
export function inviteSlotLabel(s: AppointmentSlot): string {
  const part = SLOT_PARTS.find((p) => p.from === s.from && p.until === s.until);
  return part ? `${inviteDayLabel(s.date)} · ${part.label.toLowerCase()} ${part.from}–${part.until}` : `${inviteDayLabel(s.date)} · ${s.from}–${s.until}`;
}

/** "Voormiddag" of "Namiddag" bij een afspraak; leeg als er geen uur bekend is. */
export function dayPartLabel(from?: string | null): string {
  if (!from) return '';
  const hour = Number(from.slice(0, 2));
  if (!Number.isFinite(hour)) return '';
  return hour < 12 ? 'Voormiddag' : 'Namiddag';
}

/** Waarom een uitnodiging nu nog niet kan; lege tekst betekent: kan. */
export function inviteBlock(w: { email?: string | null; technician_id?: string | null; status?: string | null }) {
  if (w.status === 'afgetekend') return 'Deze taak is al afgewerkt.';
  if (!w.technician_id) return 'Wijs eerst een ploeg toe aan deze taak.';
  const email = (w.email ?? '').trim();
  if (!email.includes('@')) return 'De klant heeft geen geldig e-mailadres.';
  return '';
}
