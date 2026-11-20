import { describe, expect, it } from "vitest";
import { priceListTravelRow } from "./price-list-pdf";

describe("prijslijst voorrijkosten", () => {
  it("toont het km-tarief van 1,45 met het vertrekadres", () => {
    const r = priceListTravelRow({ kmRate: 1.45, baseAddress: "Natveld 47, 3740 Bilzen" });
    expect(r).toMatchObject({ name: "Voorrijkosten (rit heen en terug)", unit: "per km", price: "EUR 1,45" });
    expect(r?.note).toBe("Vertrek vanaf Natveld 47, 3740 Bilzen. De afstand wordt heen en terug berekend.");
  });
  it("laat de voorrijkosten weg zonder km-tarief", () => {
    expect(priceListTravelRow({ kmRate: 0, baseAddress: "Natveld 47, 3740 Bilzen" })).toBeNull();
    expect(priceListTravelRow(null)).toBeNull();
  });
  it("toont alleen de heen-en-terugregel zonder vertrekadres", () => {
    const r = priceListTravelRow({ kmRate: 0.5, baseAddress: "  " });
    expect(r?.price).toBe("EUR 0,50");
    expect(r?.note).toBe("De afstand wordt heen en terug berekend.");
  });
});
