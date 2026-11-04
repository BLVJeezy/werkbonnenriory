import { describe, expect, it } from "vitest";
import { detectVatRate, vatFor, vatSide } from "./vat-rate";

describe("btw-tarief per lijn", () => {
  it("herkent 0, 6 en 21%", () => {
    expect(detectVatRate(100, 0)).toBe(0);
    expect(detectVatRate(100, 6)).toBe(6);
    expect(detectVatRate(100, 21)).toBe(21);
  });
  it("afwijkend tarief = fout uitgelezen", () => expect(detectVatRate(100, 30)).toBeNull());
  it("berekent btw uit tarief", () => expect(vatFor(493.47, 21)).toBe(103.63));
  it("aankoop terug te vorderen, verkoop te betalen", () => {
    expect(vatSide("aankoop")).toBe("terug te vorderen");
    expect(vatSide("verkoop")).toBe("te betalen");
  });
});
