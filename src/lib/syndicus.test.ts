import { describe, expect, it } from "vitest";
import { applySyndicus, syndicusSuggestions } from "./syndicus";

const base = {
  customer_name: "Immo Schrijnemakers BV (Olivier Schrijnemakers)",
  street: "Wasserijstraat", house_number: "1", postal_code: "3590", city: "Diepenbeek",
  site_street: "Kattebroekstraat", site_house_number: "10", site_postal_code: "3740", site_city: "Bilzen",
  syndicus: "Immo Schrijnemakers BV – Olivier Schrijnemakers", vme_name: "VME Parkzicht",
};

describe("applySyndicus", () => {
  it("maakt de VME klant met werfadres als facturatieadres", () => {
    const r = applySyndicus(base);
    expect(r.customer_name).toBe("VME Parkzicht");
    expect(r.street).toBe("Kattebroekstraat");
    expect(r.city).toBe("Bilzen");
    expect(r.syndicus).toBe("Immo Schrijnemakers BV – Olivier Schrijnemakers");
    expect(r.use_site_address).toBe(false);
  });
  it("laat gewone aanvragen ongemoeid", () => {
    const r = applySyndicus({ ...base, syndicus: null, vme_name: null });
    expect(r.customer_name).toBe(base.customer_name);
    expect(r.street).toBe("Wasserijstraat");
    expect(r.use_site_address).toBe(true);
  });
});
