import { describe, expect, it } from "vitest";
import { lineTotals } from "./invoice";

describe("lineTotals", () => {
  it("rekent excl. en incl. btw per lijn", () => {
    expect(lineTotals({ quantity: 2, unitPrice: 100, vatRate: 21 })).toEqual({ excl: 200, incl: 242 });
  });

  it("trekt eerst de korting af en rekent dan btw", () => {
    expect(lineTotals({ quantity: 2, unitPrice: 100, discount: 10, vatRate: 21 })).toEqual({ excl: 180, incl: 217.8 });
  });

  it("respecteert het eigen btw-tarief van de lijn", () => {
    expect(lineTotals({ quantity: 1, unitPrice: 100, vatRate: 6 })).toEqual({ excl: 100, incl: 106 });
    expect(lineTotals({ quantity: 1, unitPrice: 100, vatRate: 0 })).toEqual({ excl: 100, incl: 100 });
  });

  it("behandelt lege waarden als nul", () => {
    expect(lineTotals({ quantity: 0, unitPrice: 0 })).toEqual({ excl: 0, incl: 0 });
  });
});
