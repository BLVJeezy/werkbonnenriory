import { describe, expect, it } from "vitest";
import { applySyndicus, syndicusDetailsPatch, syndicusLabel, syndicusSuggestions } from "./syndicus";

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

describe("syndicusLabel", () => {
  it("combineert bedrijfsnaam en contactpersoon", () => {
    expect(syndicusLabel({ syndicus_company: " Immo Schrijnemakers BV ", syndicus_contact: "Olivier Schrijnemakers" })).toBe("Immo Schrijnemakers BV – Olivier Schrijnemakers");
  });
  it("gebruikt alleen wat ingevuld is", () => {
    expect(syndicusLabel({ syndicus_company: "Immo Schrijnemakers BV", syndicus_contact: "  " })).toBe("Immo Schrijnemakers BV");
    expect(syndicusLabel({ syndicus_company: null, syndicus_contact: "Olivier Schrijnemakers" })).toBe("Olivier Schrijnemakers");
    expect(syndicusLabel({ syndicus_company: "", syndicus_contact: null })).toBeNull();
  });
});

describe("syndicusDetailsPatch", () => {
  it("wist lege gegevens en zet de weergavenaam neer", () => {
    const p = syndicusDetailsPatch({
      syndicus_company: "Immo Schrijnemakers BV", syndicus_contact: "Olivier Schrijnemakers",
      syndicus_vat_number: "BE 0123.456.789", syndicus_street: "Wasserijstraat", syndicus_house_number: "1",
      syndicus_postal_code: "3590", syndicus_city: "Diepenbeek", syndicus_phone: "089 00 00 00",
      syndicus_email: "info@beheerlimburg.be", syndicus_billing_email: "boekhouding@beheerlimburg.be",
    });
    expect(p.syndicus).toBe("Immo Schrijnemakers BV – Olivier Schrijnemakers");
    expect(p.syndicus_billing_email).toBe("boekhouding@beheerlimburg.be");
    expect(p.syndicus_email).toBe("info@beheerlimburg.be");
    expect(p.syndicus_vat_number).toBe("BE 0123.456.789");
  });
  it("leege velden worden null en de naam verdwijnt", () => {
    const p = syndicusDetailsPatch({ syndicus_company: "  ", syndicus_email: "", syndicus_phone: "  " });
    expect(p.syndicus).toBeNull();
    expect(p.syndicus_company).toBeNull();
    expect(p.syndicus_email).toBeNull();
    expect(p.syndicus_phone).toBeNull();
    expect(p.syndicus_billing_email).toBeNull();
  });
});

describe("syndicusSuggestions", () => {
  it("toont elke syndicusnaam één keer, gesorteerd", () => {
    const s = syndicusSuggestions([
      { syndicus: "Vast Management " }, { syndicus: "Immo Schrijnemakers BV" },
      { syndicus: "Vast Management" }, { syndicus: null }, { syndicus: "  " },
    ]);
    expect(s).toEqual(["Immo Schrijnemakers BV", "Vast Management"]);
  });
});
