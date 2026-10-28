import { addDays, type InvoiceCustomer } from './invoice';

export type ReminderStage = 1 | 2 | 3;
export type DebtorKind = 'consumer' | 'business';
export type ReminderInvoice = { id: string; number: string; issue_date: string; due_date: string; total: number; paid_amount: number; kind: string; customer: InvoiceCustomer; lines: { description: string }[]; pdf_sent_at: string | null };
export type ReminderHistory = { stage: number; status: string; sent_at: string | null; document: unknown };
export type ReminderDocument = {
  stage: ReminderStage; debtorKind: DebtorKind; date: string; deadline: string; number: string;
  recipient: string; subject: string; body: string; principal: number; compensation: number; total: number;
  customer: InvoiceCustomer; companyName: string; companyVat: string; iban: string;
};
export const reminderTitles = { 1: 'Eerste betalingsherinnering', 2: 'Tweede betalingsherinnering', 3: 'Ingebrekestelling – laatste aanmaning' };
const round = (n: number) => Math.round(n * 100) / 100;
const eur = (n: number) => `EUR ${n.toLocaleString('nl-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (s: string) => new Date(`${s}T12:00:00Z`).toLocaleDateString('nl-BE');
export function brusselsDate(now = new Date()) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Brussels' }).format(now); }
export function consumerCompensation(balance: number) {
  if (balance <= 0) return 0;
  if (balance <= 150) return 20;
  if (balance <= 500) return round(30 + (balance - 150) * .1);
  return round(Math.min(2000, 65 + (balance - 500) * .05));
}
export function businessCompensation(balance: number) { return balance > 0 ? round(Math.max(150, balance * .1)) : 0; }

/** Conservative collection: no interest, no stacked fees; consumers always get 14 full days. */
export function buildReminder(o: {
  invoice: ReminderInvoice; creditAmount: number; history: ReminderHistory[]; stage: ReminderStage;
  debtorKind: DebtorKind; today: string; termsAccepted: boolean; undisputed: boolean;
  companyName: string; companyVat: string; iban: string;
}): ReminderDocument {
  const { invoice: i, stage, debtorKind, today } = o;
  const balance = round(Math.max(0, Number(i.total) - Number(i.paid_amount) - o.creditAmount));
  if (i.kind === 'creditnota' || balance <= .005) throw new Error('Geen openstaand factuursaldo om aan te manen.');
  if (i.due_date >= today) throw new Error('De vervaldag is nog niet verstreken.');
  if (!i.pdf_sent_at) throw new Error('Verzend eerst de oorspronkelijke factuur.');
  if (!i.customer.email?.trim()) throw new Error('Het facturatie-e-mailadres ontbreekt.');
  if (!o.iban.trim() || !o.companyName.trim() || !o.companyVat.trim()) throw new Error('Vul eerst de bedrijfsnaam, het ondernemingsnummer en IBAN in.');
  if (!i.lines.some(l => l.description.trim())) throw new Error('Een omschrijving van de geleverde prestaties ontbreekt.');
  if (!o.undisputed) throw new Error('Bevestig dat het openstaande saldo gecontroleerd en niet betwist is.');
  if (o.history.some(h => h.stage === stage)) throw new Error('Deze stap is al verzonden of wordt gecontroleerd. Geen dubbele aanmaning.');
  if (stage > 1) {
    if (!o.termsAccepted) throw new Error('Kosten mogen alleen bij vooraf overeengekomen, toepasselijke voorwaarden.');
    const previous = o.history.find(h => h.stage === stage - 1 && h.status === 'accepted');
    if (!previous?.sent_at) throw new Error('Verzend eerst de vorige herinnering.');
    if (today < addDays(brusselsDate(new Date(previous.sent_at)), 15)) throw new Error(`Wacht tot ${dateLabel(addDays(brusselsDate(new Date(previous.sent_at)), 15))}: de vorige betaaltermijn loopt nog.`);
    const doc = previous.document as Partial<ReminderDocument> | null;
    if (doc?.debtorKind !== debtorKind) throw new Error('Het klanttype mag niet wijzigen tijdens de herinneringsreeks.');
  }
  const deadline = addDays(today, 14);
  let compensation = stage === 1 ? 0 : debtorKind === 'consumer' ? consumerCompensation(balance) : businessCompensation(balance);
  // The same one-off compensation from step 2 is not increased or charged again at step 3.
  if (stage === 3) {
    const previous = o.history.find(h => h.stage === 2 && h.status === 'accepted');
    const old = previous?.document as Partial<ReminderDocument> | undefined;
    compensation = Math.min(compensation, Number(old?.compensation ?? 0));
  }
  const title = reminderTitles[stage];
  const feesAfterDeadline = debtorKind === 'consumer' ? consumerCompensation(balance) : businessCompensation(balance);
  const intro = stage === 1
    ? 'Volgens onze administratie staat onderstaande factuur nog open. Wellicht is de betaling aan uw aandacht ontsnapt. Wij verzoeken u vriendelijk maar uitdrukkelijk het openstaande saldo binnen onderstaande termijn te betalen.'
    : stage === 2
      ? 'Ondanks onze eerste kosteloze betalingsherinnering en het verstrijken van de betaaltermijn hebben wij geen volledige betaling ontvangen. Wij verzoeken u met aandrang het hieronder vermelde bedrag te voldoen.'
      : 'Hierbij stellen wij u uitdrukkelijk in gebreke wegens niet-betaling van onderstaande factuur. Dit is onze laatste buitengerechtelijke aanmaning. Wij sommeren u het hieronder vermelde bedrag uiterlijk op de aangegeven datum te voldoen.';
  const body = [
    `Geachte ${i.customer.name},`, '', intro, '',
    `Schuldeiser: ${o.companyName}, ${o.companyVat}`, 'Natveld 47, 3740 Bilzen',
    `Factuur: ${i.number} van ${dateLabel(i.issue_date)}`, `Oorspronkelijke vervaldag: ${dateLabel(i.due_date)}`,
    `Geleverde prestaties: ${i.lines.map(l => l.description).join('; ')}`,
    `Oorspronkelijk factuurbedrag: ${eur(Number(i.total))}`, `Reeds betaald: ${eur(Number(i.paid_amount))}`,
    ...(o.creditAmount > 0 ? [`Verrekende creditnota's: ${eur(o.creditAmount)}`] : []),
    `Openstaande hoofdsom: ${eur(balance)}`, `Eenmalige forfaitaire vergoeding: ${eur(compensation)}`, 'Verwijlinterest: EUR 0,00 (niet gevorderd)',
    `Totaal te betalen: ${eur(round(balance + compensation))}`, '',
    `Gelieve te betalen uiterlijk op ${dateLabel(deadline)} op IBAN ${o.iban}, met mededeling ${i.number}.`,
    ...(stage === 1 ? [
      'Deze eerste herinnering is kosteloos. U beschikt over minstens veertien kalenderdagen, te rekenen vanaf de dag na deze elektronische verzending.',
      `Bij uitblijven van betaling na deze termijn kan, uitsluitend als vooraf geldig overeengekomen en wettelijk toegestaan, een eenmalige forfaitaire vergoeding van ${eur(feesAfterDeadline)} worden gevorderd volgens artikel ${debtorKind === 'consumer' ? '11.5–11.7' : '11.3'} van onze algemene voorwaarden. Er wordt in deze herinneringsreeks geen verwijlinterest gevorderd.`,
    ] : [`De forfaitaire vergoeding berust op artikel ${debtorKind === 'consumer' ? '11.7 (binnen de grenzen van Boek XIX WER)' : '11.3'} van de vooraf overeengekomen algemene voorwaarden. Deze vergoeding wordt niet per herinnering opgeteld.`]),
    ...(stage === 3 ? ['Als betaling binnen deze laatste termijn uitblijft, kunnen wij het dossier ter beoordeling aan onze raadsman voorleggen en zo nodig gerechtelijke invordering vragen. Alleen wettelijk toegelaten en door de bevoegde rechter toegekende kosten kunnen vervolgens worden gevorderd.'] : []),
    '', 'Heeft u inmiddels betaald, stuur ons dan uw betalingsbewijs. Betwist u het saldo of wenst u een betalingsregeling, neem dan onmiddellijk contact op via info@riory.be. Een betwisting wordt beoordeeld vóór verdere invorderingsstappen.',
    '', `Met vriendelijke groeten,\n${o.companyName}\ninfo@riory.be\nwww.riory.be`,
  ].join('\n');
  return { stage, debtorKind, date: today, deadline, number: i.number, recipient: i.customer.email.trim(), subject: `${title} – factuur ${i.number} – ${o.companyName}`, body, principal: balance, compensation, total: round(balance + compensation), customer: i.customer, companyName: o.companyName, companyVat: o.companyVat, iban: o.iban };
}