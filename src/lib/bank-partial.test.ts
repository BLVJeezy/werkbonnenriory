import { describe, expect, it } from 'vitest';
import { partialInvoiceCandidates, partyMatches } from './bank-partial';

const inv = (id: string, direction: string, counterparty: string, number: string) => ({ id, direction, counterparty, number });

describe('deelbetaling afletteren', () => {
  it('stelt een factuur voor als de betaling kleiner is dan het openstaande bedrag', () => {
    const open = [inv('a', 'verkoop', 'Jan Janssens', '20260001')];
    const tx = { amount: 100, counterparty: 'Janssens Jan', description: 'Betaling factuur' };
    expect(partialInvoiceCandidates(tx, open, () => 250, 100).map((i) => i.id)).toEqual(['a']);
  });
  it('stelt niets voor als de betaling het openstaande bedrag exact dekt (dat is een gewone koppeling)', () => {
    const open = [inv('a', 'verkoop', 'Jan Janssens', '20260001')];
    const tx = { amount: 250, counterparty: 'Janssens', description: '' };
    expect(partialInvoiceCandidates(tx, open, () => 250, 250)).toEqual([]);
  });
  it('stelt niets voor als de betaling hoger is dan het openstaande bedrag', () => {
    const open = [inv('a', 'verkoop', 'Jan Janssens', '20260001')];
    const tx = { amount: 300, counterparty: 'Janssens', description: '' };
    expect(partialInvoiceCandidates(tx, open, () => 250, 300)).toEqual([]);
  });
  it('houdt inkomende en uitgaande betalingen gescheiden', () => {
    const open = [inv('a', 'aankoop', 'Leverancier BV', 'A-100')];
    const tx = { amount: 100, counterparty: 'Leverancier BV', description: '' };
    expect(partialInvoiceCandidates(tx, open, () => 500, 100)).toEqual([]);
  });
  it('vereist een overeenkomende naam of factuurnummer', () => {
    const open = [inv('a', 'verkoop', 'Jan Janssens', '20260001')];
    const tx = { amount: 100, counterparty: 'Iemand Anders', description: 'overschrijving' };
    expect(partialInvoiceCandidates(tx, open, () => 250, 100)).toEqual([]);
  });
  it('herkent het factuurnummer in de mededeling', () => {
    const open = [inv('a', 'verkoop', 'Tennisclub Tongeren', '20260835')];
    const tx = { amount: 100, counterparty: 'TC Tongeren', description: '+++002/0260/83557+++' };
    expect(partialInvoiceCandidates(tx, open, () => 366.4, 100).map((i) => i.id)).toEqual(['a']);
  });
});

describe('partyMatches', () => {
  it('negeert accenten en leestekens in namen', () => {
    expect(partyMatches('Café Mélanie bvba', 'Melanie', null)).toBe(true);
  });
  it('weigert te korte naamwoorden', () => {
    expect(partyMatches('betaling van Jan', 'Jan', null)).toBe(false);
  });
});
