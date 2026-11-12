import { describe, expect, it } from "vitest";
import { quoteLine, quoteOptionsTotals, quoteTotals } from "./quote";

describe("quoteTotals met opties", () => {
  const main = quoteLine("Dieptereiniging regenput", 1, "st", 250);
  const optie = { ...quoteLine("Camera-inspectie", 1, "st", 95), optional: true };

  it("telt optionele lijnen niet mee in het totaal", () => {
    const t = quoteTotals([main, optie], 21);
    expect(t.net).toBe(250);
    expect(t.vat).toBe(52.5);
    expect(t.total).toBe(302.5);
  });

  it("rekent optionele lijnen apart af", () => {
    const o = quoteOptionsTotals([main, optie], 21);
    expect(o.net).toBe(95);
    expect(o.vat).toBe(19.95);
    expect(o.total).toBe(114.95);
  });

  it("geeft nul voor opties als er geen zijn", () => {
    expect(quoteOptionsTotals([main], 6)).toEqual({ net: 0, vat: 0, total: 0 });
  });

  it("gedraagt zich als vroeger zonder optional-vlag", () => {
    const t = quoteTotals([main], 21);
    expect(t.total).toBe(302.5);
  });
  it('past 10% lijnkorting toe vóór 6% btw', () => {
    const line = quoteLine('Product', 2, 'st', 100, 10);
    expect(line).toMatchObject({ unitPrice: 90, originalUnitPrice: 100, discount: 10, amount: 180 });
    expect(quoteTotals([line], 6)).toEqual({ net: 180, vat: 10.8, total: 190.8 });
  });
  it('korting blijft hetzelfde bij opnieuw openen en opslaan', () => {
    const saved = quoteLine('Product', 3, 'st', 19.99, 12.5);
    expect(quoteLine(saved.description, saved.quantity, saved.unit, saved.originalUnitPrice ?? saved.unitPrice, saved.discount)).toEqual(saved);
    expect(saved.amount).toBe(52.47);
  });
  it('houdt korting op opties buiten het basistotaal', () => {
    const option = { ...quoteLine('Optie', 1, 'st', 100, 20), optional: true };
    expect(quoteTotals([option], 21)).toEqual({ net: 0, vat: 0, total: 0 });
    expect(quoteOptionsTotals([option], 21)).toEqual({ net: 80, vat: 16.8, total: 96.8 });
  });
  it('begrensd korting tot 0–100%', () => {
    expect(quoteLine('Product', 1, 'st', 100, 150).amount).toBe(0);
    expect(quoteLine('Product', 1, 'st', 100, -10).amount).toBe(100);
  });
});
