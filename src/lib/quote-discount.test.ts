import { describe, expect, it } from "vitest";
import { discountLabel, quoteDiscountTotal, quoteLine } from "./quote";
const m = (n: number) => `€${n.toFixed(2)}`;
describe("offertekorting voor de klant", () => {
  it("toont per lijn bruto eenheidsprijs, korting en nettoprijs", () => {
    expect(discountLabel(quoteLine("Ontstopping", 2, "stuk", 50, 10), m)).toBe("Bruto €50.00 · Korting 10% - €10.00 · Netto €45.00 per stuk");
  });
  it("toont geen kortingstekst zonder korting", () => {
    expect(discountLabel(quoteLine("Ontstopping", 1, "stuk", 50), m)).toBe("");
  });
  it("telt de totale korting zonder optionele lijnen", () => {
    const opt = { ...quoteLine("Optie", 1, "stuk", 100, 50), optional: true };
    expect(quoteDiscountTotal([quoteLine("A", 2, "stuk", 50, 10), quoteLine("B", 1, "stuk", 30), opt])).toEqual({ saved: 10, beforeDiscount: 130 });
  });
});
