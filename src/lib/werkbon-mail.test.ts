import { expect, it } from "vitest";
import { werkbonMailData } from "./werkbon-mail";

it("excludes all financial fields from outgoing work order data", () => {
  const wo = { number: 42, customer_name: "Klant", address: "Klantstraat 1", description: "Herstelling", signed_at: null, signed_name: "Klant", distance_km: 20, warranty: false, paid_amount: 123.45, vat_rate: 21, total: 123.45 };
  const material = { name: "Buis", quantity: 2, unit: "m", unit_price: 39.99 };
  expect(werkbonMailData(wo, "Herstelling", 4200, [material])).toEqual({
    number: 42, customer: "Klant", address: "Klantstraat 1", siteAddress: null, description: "Herstelling", signedAt: null, signedName: "Klant", distanceKm: 20, warranty: false, activity: "Herstelling", seconds: 4200, materials: [{ name: "Buis", quantity: 2, unit: "m" }],
  });
});

it("includes the checked worksite separately from the customer address", () => {
  const data = werkbonMailData({ number: 1, customer_name: "Klant", address: "Klantstraat 1", description: null, signed_at: null, signed_name: null, distance_km: null, warranty: false, use_site_address: true, site_street: "Werfstraat", site_house_number: "7", site_postal_code: "3740", site_city: "Bilzen" }, null, 0, []);
  expect(data.address).toBe("Klantstraat 1");
  expect(data.siteAddress).toBe("Werfstraat 7, 3740 Bilzen");
});