import { describe, expect, it } from 'vitest';
import { SLOT_PARTS, inviteBlock, inviteDays, inviteKey, inviteSlotLabel, inviteSlots } from './invite-slots';

describe('inviteDays', () => {
  it('telt enkel werkdagen en slaat het weekend over', () => {
    expect(inviteDays(new Date(2026, 9, 29), 5)).toEqual(['2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-04']);
  });
  it('start op de gevraagde dag, ook al is het een vrijdag', () => {
    expect(inviteDays(new Date(2026, 9, 30), 3)).toEqual(['2026-10-30', '2026-11-02', '2026-11-03']);
  });
});

describe('inviteSlots', () => {
  const days = ['2026-11-02', '2026-11-03'];
  it('geeft enkel de aangevinkte vakken, in dagvolgorde', () => {
    const picked = { [inviteKey(days[1]!, SLOT_PARTS[0]!)]: true, [inviteKey(days[0]!, SLOT_PARTS[1]!)]: true };
    expect(inviteSlots(days, picked)).toEqual([
      { date: '2026-11-02', from: '13:00', until: '17:00' },
      { date: '2026-11-03', from: '08:00', until: '12:00' },
    ]);
  });
  it('neemt de standaarduren van ochtend en namiddag over', () => {
    const picked = { [inviteKey(days[0]!, SLOT_PARTS[0]!)]: true, [inviteKey(days[0]!, SLOT_PARTS[1]!)]: true };
    expect(inviteSlots(days, picked)).toEqual([
      { date: '2026-11-02', from: '08:00', until: '12:00' },
      { date: '2026-11-02', from: '13:00', until: '17:00' },
    ]);
  });
  it('levert niets als er niets aangevinkt is', () => {
    expect(inviteSlots(days, {})).toEqual([]);
  });
});

describe('inviteSlotLabel', () => {
  it('toont dag, deel van de dag en uren', () => {
    expect(inviteSlotLabel({ date: '2026-11-03', from: '08:00', until: '12:00' })).toBe('di 3/11 · ochtend 08:00–12:00');
  });
  it('valt terug op de uren bij een afwijkend vak', () => {
    expect(inviteSlotLabel({ date: '2026-11-03', from: '07:30', until: '09:00' })).toBe('di 3/11 · 07:30–09:00');
  });
});

describe('inviteBlock', () => {
  it('staat een uitnodiging toe bij een open taak met ploeg en klantmail', () => {
    expect(inviteBlock({ email: 'klant@voorbeeld.be', technician_id: 'x', status: 'toegewezen' })).toBe('');
  });
  it('wijst op een ontbrekende ploeg', () => {
    expect(inviteBlock({ email: 'klant@voorbeeld.be', technician_id: null, status: 'nieuw' })).toBe('Wijs eerst een ploeg toe aan deze taak.');
  });
  it('wijst op een ontbrekend klantmailadres', () => {
    expect(inviteBlock({ email: '   ', technician_id: 'x', status: 'toegewezen' })).toBe('De klant heeft geen geldig e-mailadres.');
  });
  it('wijst op een afgewerkte taak', () => {
    expect(inviteBlock({ email: 'klant@voorbeeld.be', technician_id: 'x', status: 'afgetekend' })).toBe('Deze taak is al afgewerkt.');
  });
});
