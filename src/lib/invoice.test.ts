import { describe, expect, it } from "vitest";
import { addDays, buildInvoice, isFullyPaid, peppolIdFromVat } from "./invoice";

const wo = {
  number: 7, customer_name: "Jan", address: "x", street: null, house_number: null, postal_code: null, city: null,
  vat_number: null, email: "jan@x.be", billing_email: null, distance_km: 10, warranty: false, vat_rate: 21,
  paid_amount: null, paid_at: null, use_site_address: false, site_street: null, site_house_number: null, site_postal_code: null, site_city: null,
};

describe("invoice", () => {
  it("bills first hour fully plus started quarters, km and materials", () => {
    const inv = buildInvoice({ wo, activity: { name: "Herstelling", hourly_rate: 60 }, seconds: 3600 + 60, kmRate: 0.5, materials: [{ name: "Kraan", quantity: 2, unit: "st", unit_price: 10 }] });
    expect(inv.lines.map((l) => l.amount)).toEqual([75, 5, 20]);
    expect(inv.net).toBe(100);
    expect(inv.total).toBe(121);
  });
  it("warranty drops first hour and kilometres", () => {
    const inv = buildInvoice({ wo: { ...wo, warranty: true }, activity: { name: "A", hourly_rate: 60 }, seconds: 3600, kmRate: 0.5, materials: [] });
    expect(inv.total).toBe(0);
  });
  it("prefers billing email", () => {
    expect(buildInvoice({ wo: { ...wo, billing_email: "f@x.be" }, activity: null, seconds: 0, kmRate: 0, materials: [] }).customer.email).toBe("f@x.be");
  });
  it("only fully paid invoices auto-send", () => {
    expect(isFullyPaid(121, 121)).toBe(true);
    expect(isFullyPaid(121, 50)).toBe(false);
    expect(isFullyPaid(121, 0)).toBe(false);
  });
  it("maps BE vat to peppol id", () => {
    expect(peppolIdFromVat("BE 0840.931.404")).toBe("0208:0840931404");
    expect(peppolIdFromVat("NL123")).toBeNull();
  });
  it("due date 14 days later", () => {
    expect(addDays("2026-10-27", 14)).toBe("2026-11-10");
  });
});

import { buildManualInvoice as bmi, groupInvoiceLines as gil, isInvoiceEditable as iie } from "./invoice";
describe("factuurtitels", () => {
  it("telt de producten onder een titel samen", () => {
    const inv = bmi([
      { description: "Ruimen", quantity: 1, unit: "st", unitPrice: 150, vatRate: 21, group: "Dieptereiniging", hidePrice: true },
      { description: "Camera", quantity: 2, unit: "st", unitPrice: 25, vatRate: 21, group: "Dieptereiniging", hidePrice: true },
      { description: "Los", quantity: 1, unit: "st", unitPrice: 10, vatRate: 21 },
    ]);
    const s = gil(inv.lines);
    expect(s[0]).toMatchObject({ title: "Dieptereiniging", subtotal: 200, hidePrice: true });
    expect(s[1]).toMatchObject({ title: null, subtotal: 10 });
    expect(inv.net).toBe(210);
  });
  it("factuur aanpasbaar tot ze verzonden is", () => {
    const base = { kind: "factuur", status: "concept", sent_at: null, pdf_sent_at: null, okioki_sent_at: null, post_sent_at: null };
    expect(iie(base)).toBe(true);
    expect(iie({ ...base, pdf_sent_at: "2026-10-31" })).toBe(false);
    expect(iie({ ...base, post_sent_at: "2026-10-31" })).toBe(false);
    expect(iie({ ...base, kind: "creditnota" })).toBe(false);
  });
});

import { splitTravelLine, travelKmLine } from "./invoice";
describe("kilometers op een handmatige factuur", () => {
  it("maakt dezelfde verplaatsingslijn als bij offertes", () => {
    expect(travelKmLine(12, 0.45, 21)).toMatchObject({
      description: "Verplaatsing heen en terug (12 km)", quantity: 12, unit: "km", unitPrice: 0.45, vatRate: 21, group: null,
    });
  });
  it("geen lijn zonder afstand", () => {
    expect(travelKmLine(null, 0.45, 21)).toBeNull();
    expect(travelKmLine(0, 0.45, 21)).toBeNull();
  });
  it("telt mee in de factuurtotalen en blijft los van een titel", () => {
    const travel = travelKmLine(12, 0.45, 21)!;
    const inv = bmi([
      { description: "Ruimen", quantity: 1, unit: "st", unitPrice: 150, vatRate: 21, group: "Dieptereiniging" },
      travel,
    ]);
    expect(inv.net).toBe(155.4);
    expect(inv.vat).toBe(32.63);
    expect(inv.total).toBe(188.03);
    const s = gil(inv.lines);
    expect(s[0]).toMatchObject({ title: "Dieptereiniging", subtotal: 150 });
    expect(s[1]).toMatchObject({ title: null, subtotal: 5.4 });
  });
  it("haalt bewaarde kilometers terug uit de factuurlijnen", () => {
    const saved = bmi([
      { description: "Ruimen", quantity: 1, unit: "st", unitPrice: 150, vatRate: 21 },
      travelKmLine(9.2, 1.45, 21)!,
    ]);
    const { kmLine, rest } = splitTravelLine(saved.lines);
    expect(kmLine).toMatchObject({ unit: "km", quantity: 9.2, unitPrice: 1.45, vatRate: 21 });
    expect(rest.map((l) => l.unit)).toEqual(["st"]);
    expect(splitTravelLine(rest).kmLine).toBeNull();
  });
});

import { activityLineValues } from "./invoice";
describe("activiteit op een handmatige factuur", () => {
  it("zet naam, eenheid uren en het tarief van de activiteit op de lijn", () => {
    expect(activityLineValues({ name: "Herstelling/grondwerk.", hourly_rate: 137.5 })).toEqual({
      title: "Herstelling/grondwerk.", detail: "", unit: "u", unitPrice: "137.5",
    });
  });
  it("activiteit zonder tarief krijgt geen prijs", () => {
    expect(activityLineValues({ name: "Ledigen septische put", hourly_rate: null }).unitPrice).toBe("");
  });
});

import { buildManualCreditNote } from "./invoice";
describe("buildManualCreditNote", () => {
  it("maakt alle bedragen van een losse creditnota negatief", () => {
    const c = buildManualCreditNote([{ description: "Terugbetaling", quantity: 2, unit: "st", unitPrice: 50, vatRate: 21 }]);
    expect(c.net).toBe(-100);
    expect(c.vat).toBe(-21);
    expect(c.total).toBe(-121);
    expect(c.lines[0]?.amount).toBe(-100);
  });
});

describe("garantie op factuur", () => {
  it("toont volledige arbeid en km met reductielijnen, totaal zonder eerste uur en km", () => {
    const wo = { id: "w", number: 1, customer_name: "K", address: null, email: null, billing_email: null, vat_number: null, street: null, house_number: null, postal_code: null, city: null, use_site_address: false, site_street: null, site_house_number: null, site_postal_code: null, site_city: null, distance_km: 20, warranty: true, vat_rate: 21, paid_amount: null, paid_at: null } as unknown as Parameters<typeof buildInvoice>[0]["wo"];
    const r = buildInvoice({ wo, activity: { name: "Ontstopping", hourly_rate: 80 }, seconds: 2 * 3600, materials: [], kmRate: 0.5 });
    expect(r.lines.map((l) => l.amount)).toEqual([160, 10, -80, -10]);
    expect(r.net).toBe(80);
  });
});
