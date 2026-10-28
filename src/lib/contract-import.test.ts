import { describe, expect, it } from "vitest";
import { startedContracts } from "./contract-import";

describe("startedContracts", () => {
  it("imports only started contracts, excluding stopped, expired and draft contracts", () => {
    const rows = ["gestart", "gestopt", "afgelopen", "opgemaakt"].map((status, i) => ({ status, contractnummer: `2023/000${i + 1}` }));
    expect(startedContracts(rows).map((c) => c.number)).toEqual(["2023/0001"]);
  });
  it("groups source lines without losing their amounts, discounts or VAT", () => {
    const rows = [
      { status: "gestart", contractnummer: "2023/0005", aantal: 1, eenheidsprijs: 165, "BTW-percentage": 6 },
      { status: "gestart", contractnummer: "2023/0005", aantal: 22, eenheidsprijs: 1.35, kortingspercentage: 50, "BTW-percentage": 6 },
    ];
    expect(startedContracts(rows)).toEqual([{ number: "2023/0005", lines: rows }]);
  });
});