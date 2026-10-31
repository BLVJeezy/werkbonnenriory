import { describe, it, expect } from "vitest";
import { toDoc, dubbelSleutel } from "./werkbonnen";

const base = { id: "a1", number: "2026001", issue_date: "2026-10-28", net: 100, vat: 21, customer: { name: "Moorma BV" } };

describe("werkbonnen verkoopfacturen", () => {
  it("neemt facturen vanaf 24/10/2026 over", () => {
    expect(toDoc({ ...base, issue_date: "2026-10-24" })?.ref).toBe("wb-a1");
  });
  it("laat facturen vóór 24/10/2026 aan Simpla", () => {
    expect(toDoc({ ...base, issue_date: "2026-10-23" })).toBeNull();
  });
  it("slaat concepten over", () => {
    expect(toDoc({ ...base, status: "draft" })).toBeNull();
  });
  it("herkent creditnota's en gebruikt positieve bedragen", () => {
    const d = toDoc({ ...base, kind: "credit_note", net: -50, vat: -10.5 })!;
    expect(d.credit).toBe(true);
    expect(d.lijnen[0]).toMatchObject({ ex: 50, vat: 10.5 });
  });
  it("dubbelsleutel scheidt factuur en creditnota met hetzelfde nummer", () => {
    expect(dubbelSleutel("2026 001", false)).toBe("f:2026001");
    expect(dubbelSleutel("2026001", true)).not.toBe(dubbelSleutel("2026001", false));
  });
});
