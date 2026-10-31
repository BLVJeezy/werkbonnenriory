import { describe, expect, it } from "vitest";
import { normalizeEnterpriseNumber, parseNbbCsv, pickLatestPerYear } from "./nbb";

describe("parseNbbCsv", () => {
  it("haalt omzet, brutomarge, winst, eigen vermogen en FTE uit MAR-codes", () => {
    const csv = `"Reference number","2026-1"\n"Accounting period end date","2025-12-31"\n"70","1000.5"\n"9900","400"\n"9904","-25"\n"10/15","300"\n"9087","4.2"`;
    expect(parseNbbCsv(csv)).toMatchObject({ fiscal_year: 2025, revenue: 1000.5, gross_margin: 400, profit: -25, equity: 300, employees: 4.2, reference: "2026-1" });
  });
  it("laat niet gepubliceerde omzet leeg (verkort model)", () => {
    expect(parseNbbCsv(`"Accounting period end date","2024-12-31"\n"9900","10"`).revenue).toBeNull();
  });
});

describe("normalizeEnterpriseNumber", () => {
  it("aanvaardt BE-notatie en 9 cijfers", () => {
    expect(normalizeEnterpriseNumber("BE 0403.170.701")).toBe("0403170701");
    expect(normalizeEnterpriseNumber("403170701")).toBe("0403170701");
  });
  it("weigert onzin", () => expect(normalizeEnterpriseNumber("12345")).toBeNull());
});

describe("pickLatestPerYear", () => {
  it("neemt per jaar de laatste neerlegging", () => {
    const r = pickLatestPerYear([
      { periodEndDateYear: 2025, depositDate: "2026-05-01", id: "a" },
      { periodEndDateYear: 2025, depositDate: "2026-07-01", id: "b" },
      { periodEndDateYear: 2024, depositDate: "2025-06-01", id: "c" },
    ]);
    expect(r.map((x) => x.id)).toEqual(["b", "c"]);
  });
});
