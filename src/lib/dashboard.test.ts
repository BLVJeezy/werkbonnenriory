import { describe, expect, it } from "vitest";
import { groupOmzet, type InvoiceOmzetRow } from "./dashboard";

const inv = (issue_date: string, net: number, kind = "factuur"): InvoiceOmzetRow => ({
  id: issue_date + net + kind,
  issue_date,
  net,
  vat: 0,
  total: net,
  paid_amount: 0,
  kind,
});

describe("groupOmzet", () => {
  it("groepeert per dag en vult lege dagen aan met 0", () => {
    const punten = groupOmzet([inv("2026-10-01", 100), inv("2026-10-03", 50)], "2026-10-01", "2026-10-03");
    expect(punten.map((p) => p.key)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(punten.map((p) => p.omzet)).toEqual([100, 0, 50]);
  });

  it("trekt creditnota’s af van de omzet", () => {
    const punten = groupOmzet([inv("2026-10-01", 100), inv("2026-10-01", 30, "creditnota")], "2026-10-01", "2026-10-01");
    expect(punten[0].omzet).toBe(70);
  });

  it("groepeert per maand bij een periode langer dan 62 dagen", () => {
    const punten = groupOmzet([inv("2026-01-15", 200), inv("2026-03-02", 100)], "2026-01-01", "2026-03-31");
    expect(punten.map((p) => p.key)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(punten.map((p) => p.omzet)).toEqual([200, 0, 100]);
  });
});
