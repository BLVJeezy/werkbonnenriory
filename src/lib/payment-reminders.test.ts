import { describe, expect, it } from 'vitest';
import { buildReminder, consumerCompensation, businessCompensation, type ReminderInvoice } from './payment-reminders';
const invoice: ReminderInvoice = { id: 'id', number: '2026-1', issue_date: '2026-10-01', due_date: '2026-10-14', total: 500, paid_amount: 0, kind: 'factuur', pdf_sent_at: '2026-10-01T09:00:00Z', customer: { name: 'Klant', email: 'klant@example.com', address: 'Teststraat 1', street: null, houseNumber: null, postalCode: null, city: null, vatNumber: null, siteAddress: null }, lines: [{ description: 'Interventie' }] };
const base = { invoice, creditAmount: 0, history: [], stage: 1 as const, debtorKind: 'consumer' as const, today: '2026-10-28', termsAccepted: true, undisputed: true, companyName: 'Riory bv', companyVat: 'BE0840931404', iban: 'BE00000000000000' };
const first = { stage: 1, status: 'accepted', sent_at: '2026-10-14T09:00:00Z', document: { debtorKind: 'consumer' } };
describe('Betalingsherinneringen – voorwaarden 11.3 en 11.5–11.7', () => {
  it('eerste herinnering is gratis', () => { expect(buildReminder(base).compensation).toBe(0); });
  it('consument krijgt veertien volledige kalenderdagen vanaf volgende dag', () => { expect(buildReminder(base).deadline).toBe('2026-11-11'); });
  it('geen tweede herinnering op laatste beschermde dag', () => { expect(() => buildReminder({ ...base, stage: 2, history: [first] })).toThrow('29/10/2026'); });
  it('tweede herinnering is kosteloos voor consument na 14 dagen', () => {
    const doc = buildReminder({ ...base, today: '2026-10-29', stage: 2, history: [first], termsAccepted: false });
    expect(doc.compensation).toBe(0);
    expect(doc.total).toBe(500);
    expect(doc.body).toContain('volledig kosteloos');
    expect(doc.body).not.toContain('berust op artikel');
  });
  it('tweede herinnering is kosteloos voor onderneming (B2B 430,82 -> €0 i.p.v. €150)', () => {
    const b2bInvoice: ReminderInvoice = { ...invoice, total: 430.82, paid_amount: 0 };
    const b2bFirst = { stage: 1, status: 'accepted', sent_at: '2026-10-14T09:00:00Z', document: { debtorKind: 'business' } };
    const doc = buildReminder({ ...base, invoice: b2bInvoice, debtorKind: 'business', today: '2026-10-29', stage: 2, history: [b2bFirst], termsAccepted: false });
    expect(doc.principal).toBe(430.82);
    expect(doc.compensation).toBe(0);
    expect(doc.total).toBe(430.82);
    expect(doc.body).toContain('volledig kosteloos');
  });
  it('eerste herinnering belooft geen automatische vergoeding bij tweede herinnering', () => {
    const doc = buildReminder({ ...base, termsAccepted: false });
    expect(doc.body).toContain('Ook een eventuele tweede betalingsherinnering is kosteloos');
    expect(doc.body).toContain('niet automatisch en niet bij de tweede betalingsherinnering gevorderd');
  });
  it('consument maximaal 20 tot 150 euro', () => { expect(consumerCompensation(150)).toBe(20); });
  it('consument 30 plus tien procent boven 150', () => { expect(consumerCompensation(300)).toBe(45); });
  it('consument 65 plus vijf procent boven 500', () => { expect(consumerCompensation(1000)).toBe(90); });
  it('consument plafond 2000', () => { expect(consumerCompensation(100000)).toBe(2000); });
  it('onderneming 10 procent minimum 150', () => { expect(businessCompensation(500)).toBe(150); expect(businessCompensation(2000)).toBe(200); });
  it('betaalde factuur blokkeren', () => { expect(() => buildReminder({ ...base, invoice: { ...invoice, paid_amount: 500 } })).toThrow('Geen openstaand'); });
  it('creditnota is geen te innen schuld', () => { expect(() => buildReminder({ ...base, invoice: { ...invoice, kind: 'creditnota' } })).toThrow('Geen openstaand'); });
  it('verrekent gedeeltelijke betaling en creditnota', () => { expect(buildReminder({ ...base, invoice: { ...invoice, paid_amount: 100 }, creditAmount: 50 }).principal).toBe(350); });
  it('volledig gecrediteerd blokkeert', () => { expect(() => buildReminder({ ...base, creditAmount: 500 })).toThrow('Geen openstaand'); });
  it('kosteloze stap 3 na gratis stap 2 vereist geen voorwaardenbevestiging en blijft €0', () => {
    const freeSecond = { stage: 2, status: 'accepted', sent_at: '2026-11-01T09:00:00Z', document: { debtorKind: 'consumer', compensation: 0 } };
    const doc = buildReminder({ ...base, today: '2026-11-30', stage: 3, history: [freeSecond], termsAccepted: false });
    expect(doc.compensation).toBe(0);
    expect(doc.total).toBe(500);
  });
  it('historische stap 2 met kosten blijft ongewijzigd en vereist voorwaardenbevestiging in stap 3', () => {
    const oldSecond = { stage: 2, status: 'accepted', sent_at: '2026-11-01T09:00:00Z', document: { debtorKind: 'business', compensation: 150 } };
    expect(() => buildReminder({ ...base, debtorKind: 'business', today: '2026-11-30', stage: 3, history: [oldSecond], termsAccepted: false })).toThrow('vooraf');
    const doc = buildReminder({ ...base, debtorKind: 'business', today: '2026-11-30', stage: 3, history: [oldSecond], termsAccepted: true });
    expect(doc.compensation).toBe(150);
    expect(doc.total).toBe(650);
    expect(oldSecond.document.compensation).toBe(150);
  });
  it('geen betwiste schuld aanmanen', () => { expect(() => buildReminder({ ...base, undisputed: false })).toThrow('niet betwist'); });
  it('geen dubbele stap', () => { expect(() => buildReminder({ ...base, history: [first] })).toThrow('al verzonden'); });
  it('kosten nooit stapelen in derde stap', () => { expect(buildReminder({ ...base, today: '2026-11-30', stage: 3, history: [{ stage: 2, status: 'accepted', sent_at: '2026-11-01T09:00:00Z', document: { debtorKind: 'consumer', compensation: 65 } }] }).total).toBe(565); });
  it('onverzonden factuur blokkeren', () => { expect(() => buildReminder({ ...base, invoice: { ...invoice, pdf_sent_at: null } })).toThrow('oorspronkelijke'); });
});