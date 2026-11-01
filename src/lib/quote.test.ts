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
});
