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
