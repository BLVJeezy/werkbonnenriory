import { describe, expect, it } from "vitest";
import { insuranceReport } from "./insurance-report";

describe("verzekeringsverslag", () => {
  const r = insuranceReport(
    { number: 104, customer_name: "Bart Wouters", address: "Kerkstraat 1, 3740 Bilzen", description: "Lek in regenpijp", work_notes: "Pijp vervangen", signed_name: "Bart" },
    { crew: "Ploeg 1", activity: "Ontstopping", hours: 1.25, materials: [{ name: "PVC-buis", quantity: 2, unit: "m" }], photoCount: 3 },
  );
  it("neemt werkbon, klant, adres, ploeg en foto's over", () => {
    for (const s of ["#104", "Bart Wouters", "Kerkstraat 1, 3740 Bilzen", "Ploeg 1", "Ontstopping", "3 foto's"]) expect(r.intro).toContain(s);
  });
  it("neemt omschrijving, opmerkingen en materialen over", () => {
    for (const s of ["Lek in regenpijp", "Pijp vervangen", "2 m PVC-buis"]) expect(r.findings).toContain(s);
  });
});
