import { describe, expect, it } from "vitest";
import { groupOmzet, groupWeekOmzet, manualInvoiceRows, type InvoiceOmzetRow } from "./dashboard";

const inv = (issue_date: string, net: number, kind = "factuur", work_order_id: string | null = null): InvoiceOmzetRow => ({
  id: issue_date + net + kind,
  issue_date,
  net,
  vat: 0,
  total: net,
  paid_amount: 0,
  kind,
  work_order_id,
});

describe("groupOmzet", () => {
  it("telt volledige weken, trekt creditnota's af en sluit latere datums uit", () => {
    const rows = [inv("2026-11-02", 100), inv("2026-11-08", 25), inv("2026-11-08", 10, "creditnota"), inv("2026-11-09", 999)];
    expect(groupWeekOmzet(rows, "2026-10-26", "2026-11-08").map(r => r.omzet)).toEqual([0, 115]);
  });
  it("groepeert per dag en vult lege dagen aan met 0", () => {
    const punten = groupOmzet([inv("2026-10-01", 100), inv("2026-10-03", 50)], "2026-10-01", "2026-10-03");
    expect(punten.map((p) => p.key)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(punten.map((p) => p.omzet)).toEqual([100, 0, 50]);
  });

  it("trekt creditnota’s af van de omzet", () => {
    const punten = groupOmzet([inv("2026-10-01", 100), inv("2026-10-01", 30, "creditnota")], "2026-10-01", "2026-10-01");
    expect(punten[0]?.omzet).toBe(70);
  });

  it("groepeert per maand bij een periode langer dan 62 dagen", () => {
    const punten = groupOmzet([inv("2026-01-15", 200), inv("2026-03-02", 100)], "2026-01-01", "2026-03-31");
    expect(punten.map((p) => p.key)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(punten.map((p) => p.omzet)).toEqual([200, 0, 100]);
  });

  it("houdt alleen zelf gemaakte facturen over, niet de werkbonfacturen", () => {
    const rijen = [inv("2026-10-01", 100), inv("2026-10-02", 50, "factuur", "wb-1")];
    expect(manualInvoiceRows(rijen).map((r) => r.net)).toEqual([100]);
  });

  it("telt zelf gemaakte facturen bij de werkbonnen op hun eigen datum", () => {
    const werkbon: InvoiceOmzetRow = { id: "wb", issue_date: "2026-10-01", net: 200, vat: 0, total: 0, paid_amount: 0, kind: "werkbon" };
    const facturen = [inv("2026-10-01", 100), inv("2026-10-02", 50), inv("2026-10-03", 25, "factuur", "wb-9")];
    const punten = groupOmzet([werkbon, ...manualInvoiceRows(facturen)], "2026-10-01", "2026-10-03");
    expect(punten.map((p) => p.omzet)).toEqual([300, 50, 0]);
  });
});
