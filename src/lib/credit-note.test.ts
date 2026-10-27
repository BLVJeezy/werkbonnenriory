import { describe, expect, it } from "vitest";
import { buildCreditNote } from "./invoice";
import { quoteLine, quoteTotals } from "./quote";

describe("buildCreditNote", () => {
  const inv = {
    lines: [
      { description: "Arbeid", quantity: 2, unit: "u", unitPrice: 65, amount: 130 },
      { description: "Kraan", quantity: 1, unit: "st", unitPrice: 80, amount: 80 },
    ],
    vatRate: 21, net: 210, vat: 44.1, total: 254.1,
  };

  it("draait alle bedragen om naar negatief", () => {
    const cn = buildCreditNote(inv);
    expect(cn.lines.map((l) => l.amount)).toEqual([-130, -80]);
    expect(cn.net).toBe(-210);
    expect(cn.vat).toBe(-44.1);
    expect(cn.total).toBe(-254.1);
    expect(cn.vatRate).toBe(21);
  });

  it("behoudt omschrijving, aantal en eenheidsprijs", () => {
    const cn = buildCreditNote(inv);
    expect(cn.lines[0]).toMatchObject({ description: "Arbeid", quantity: 2, unit: "u", unitPrice: 65 });
  });

  it("blijft negatief ook als de bron al negatief is", () => {
    const cn = buildCreditNote({ ...inv, net: -210, vat: -44.1, total: -254.1 });
    expect(cn.total).toBe(-254.1);
  });
});

describe("quoteTotals", () => {
  it("telt lijnen op en rekent btw", () => {
    const lines = [quoteLine("Plaatsing ketel", 1, "st", 1200), quoteLine("Arbeid", 3, "u", 65)];
    const t = quoteTotals(lines, 21);
    expect(t.net).toBe(1395);
    expect(t.vat).toBe(292.95);
    expect(t.total).toBe(1687.95);
  });

  it("rondt lijnbedragen af op centen", () => {
    expect(quoteLine("Materiaal", 2.5, "m", 10.11).amount).toBe(25.28);
  });
});
