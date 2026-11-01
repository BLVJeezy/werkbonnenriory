import { describe, expect, it } from "vitest";
import { cardGross } from "./card-gross";

const d = (b: string, c: string) => `MC-UID: 160375 01 DD. 2026-okt-29   BRUTO: ${b} - COMM ${c} OV.REF.42615`;

describe("cardGross", () => {
  it("leest bruto bedrag uit Europabank-mededeling", () => expect(cardGross(d("654,76", "13,10"), 641.66)).toBe(654.76));
  it("ondersteunt duizendtallen", () => expect(cardGross(d("1.234,50", "4,50"), 1230)).toBe(1234.5));
  it("weigert als bruto - commissie niet gelijk is aan netto", () => expect(cardGross(d("654,76", "13,10"), 600)).toBeNull());
  it("geen bruto in mededeling", () => expect(cardGross("Factuur 20260801", 100)).toBeNull());
  it("uitgaande betaling negeren", () => expect(cardGross(d("10,00", "0,15"), -9.85)).toBeNull());
});
