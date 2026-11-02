import { describe, expect, it } from 'vitest';
import { SLOT_CHOICES, dayPartLabel, inviteBlock, inviteDayLabel, inviteDays, inviteSlotLabel, inviteSlots, partsForChoice } from './invite-slots';

describe('inviteDays', () => {
  it('telt enkel werkdagen en slaat het weekend over', () => {
    expect(inviteDays(new Date(2026, 9, 29), 5)).toEqual(['2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03', '2026-11-04']);
  });
  it('start op de gevraagde dag, ook al is het een vrijdag', () => {
    expect(inviteDays(new Date(2026, 9, 30), 3)).toEqual(['2026-10-30', '2026-11-02', '2026-11-03']);
  });
});

describe('partsForChoice', () => {
  it('geeft enkel het voormiddagvak bij de keuze voormiddag', () => {
    expect(partsForChoice('voormiddag')).toEqual([{ key: 'voormiddag', label: 'Voormiddag', from: '08:00', until: '12:00' }]);
  });
  it('geeft enkel het namiddagvak bij de keuze namiddag', () => {
    expect(partsForChoice('namiddag')).toEqual([{ key: 'namiddag', label: 'Namiddag', from: '13:00', until: '17:00' }]);
  });
  it('geeft beide vakken in volgorde voormiddag dan namiddag', () => {
    expect(partsForChoice('beide').map((p) => p.key)).toEqual(['voormiddag', 'namiddag']);
  });
  it('biedt vier keuzes aan bovenaan het keuzescherm', () => {
    expect(SLOT_CHOICES.map((c) => c.key)).toEqual(['beide', 'voormiddag', 'namiddag', 'eerste']);
  });
});

describe('inviteSlots', () => {
  const days = ['2026-11-02', '2026-11-03'];
  it('stelt één deel van de dag op elke voorgestelde dag voor', () => {
    expect(inviteSlots(days, 'namiddag')).toEqual([
      { date: '2026-11-02', from: '13:00', until: '17:00' },
      { date: '2026-11-03', from: '13:00', until: '17:00' },
    ]);
  });
  it('stelt beide vakken voor, per dag in volgorde voormiddag dan namiddag', () => {
    expect(inviteSlots(days, 'beide')).toEqual([
      { date: '2026-11-02', from: '08:00', until: '12:00' },
      { date: '2026-11-02', from: '13:00', until: '17:00' },
      { date: '2026-11-03', from: '08:00', until: '12:00' },
      { date: '2026-11-03', from: '13:00', until: '17:00' },
    ]);
  });
});

describe('dayPartLabel', () => {
  it('noemt een afspraak voor de middag voormiddag', () => {
    expect(dayPartLabel('08:00:00')).toBe('Voormiddag');
  });
  it('noemt een afspraak na de middag namiddag', () => {
    expect(dayPartLabel('13:00:00')).toBe('Namiddag');
  });
  it('laat het vak weg zolang er geen uur ingevuld is', () => {
    expect(dayPartLabel(null)).toBe('');
  });
});

describe('inviteDayLabel', () => {
  it('toont dag en datum', () => {
    expect(inviteDayLabel('2026-11-03')).toBe('di 3/11');
  });
});

describe('inviteSlotLabel', () => {
  it('toont dag, deel van de dag en uren', () => {
    expect(inviteSlotLabel({ date: '2026-11-03', from: '08:00', until: '12:00' })).toBe('di 3/11 · voormiddag 08:00–12:00');
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

import { partsForChoice as pfc, inviteSlotLabel as isl } from './invite-slots';
it('eerste klant stelt aankomst 08:00–09:00 voor', () => {
  expect(pfc('eerste').map((p) => [p.from, p.until])).toEqual([['08:00', '09:00']]);
  expect(isl({ date: '2026-11-03', from: '08:00', until: '09:00' })).toBe('di 3/11 · eerste klant, aankomst 08:00–09:00');
});
