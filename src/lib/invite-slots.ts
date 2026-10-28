import type { AppointmentSlot } from './appointments';

export type SlotPart = { key: string; label: string; from: string; until: string };

/** Standaardvakken die Riory voorlegt: een ochtend- en een namiddagvak. */
export const SLOT_PARTS: SlotPart[] = [
  { key: 'ochtend', label: 'Ochtend', from: '08:00', until: '12:00' },
  { key: 'namiddag', label: 'Namiddag', from: '13:00', until: '17:00' },
];

const DAY_NAMES = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];

export const inviteKey = (date: string, part: SlotPart) => `${date}|${part.key}`;

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

/** De aangevinkte standaardvakken, per dag in volgorde ochtend dan namiddag. */
export function inviteSlots(dates: string[], picked: Record<string, boolean>): AppointmentSlot[] {
  return dates.flatMap((date) =>
    SLOT_PARTS.filter((part) => picked[inviteKey(date, part)]).map((part) => ({ date, from: part.from, until: part.until })),
  );
}

/** "di 29/10" */
export function inviteDayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}

/** "di 29/10 · ochtend 08:00–12:00" */
export function inviteSlotLabel(s: AppointmentSlot): string {
  const part = SLOT_PARTS.find((p) => p.from === s.from && p.until === s.until);
  return part ? `${inviteDayLabel(s.date)} · ${part.label.toLowerCase()} ${part.from}–${part.until}` : `${inviteDayLabel(s.date)} · ${s.from}–${s.until}`;
}

/** Waarom een uitnodiging nu nog niet kan; lege tekst betekent: kan. */
export function inviteBlock(w: { email?: string | null; technician_id?: string | null; status?: string | null }) {
  if (w.status === 'afgetekend') return 'Deze taak is al afgewerkt.';
  if (!w.technician_id) return 'Wijs eerst een ploeg toe aan deze taak.';
  const email = (w.email ?? '').trim();
  if (!email.includes('@')) return 'De klant heeft geen geldig e-mailadres.';
  return '';
}
