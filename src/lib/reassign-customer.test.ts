import { describe, expect, it } from "vitest";
import { reassignCustomerPatch } from "./reassign-customer";

const wo = { customer_name: "Jan", street: "Dorp", house_number: "1", postal_code: "3740", city: "Bilzen", vat_rate: 6, use_site_address: false };
const firma = { id: "c1", name: "Firma BV", street: "Zaak", house_number: "9", postal_code: "3500", city: "Hasselt", vat_number: "BE0123456789" };

describe("reassignCustomerPatch", () => {
  it("houdt het oorspronkelijke adres als werfadres", () => {
    const p = reassignCustomerPatch(wo, firma);
    expect(p).toMatchObject({ use_site_address: true, site_street: "Dorp", site_city: "Bilzen", customer_name: "Firma BV", city: "Hasselt", customer_id: "c1" });
  });
  it("bestaand werfadres blijft staan", () => {
    const p = reassignCustomerPatch({ ...wo, use_site_address: true, site_street: "Werf" }, firma);
    expect("site_street" in p).toBe(false);
  });
  it("zakelijke klant met BE-nummer krijgt 0% btw", () => {
    expect(reassignCustomerPatch(wo, firma).vat_rate).toBe(0);
  });
});
