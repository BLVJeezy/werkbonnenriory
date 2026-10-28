import { describe, expect, it } from "vitest";
import { customerKey, customerPatch, rowsToCustomers, splitCustomerAddress } from "./customers";

describe("rowsToCustomers", () => {
  it("leest Nederlandse kolomkoppen", () => {
    const [c] = rowsToCustomers([{ Naam: "Jan Peeters", Straat: "Kerkstraat", "Nr.": 5, Postcode: 3740, Plaats: "Bilzen", GSM: "0470", "E-mail": "j@x.be", "BTW-nummer": "BE0123" }]);
    expect(c).toEqual({ name: "Jan Peeters", street: "Kerkstraat", house_number: "5", postal_code: "3740", city: "Bilzen", phone: "0470", email: "j@x.be", billing_email: null, vat_number: "BE0123", project_name: null });
  });
  it("slaat rijen zonder naam over", () => {
    expect(rowsToCustomers([{ Straat: "x" }])).toEqual([]);
  });
  it("herkent naam en volledig adres ongeacht hoofdletters en spaties", () => {
    expect(customerKey({ name: " Jan Péeters ", street:'Kerk straat',house_number:'12 A',postal_code: "3740" })).toBe(customerKey({name:'Jan Peeters',street:'Kerkstraat',house_number:'12a',postal_code:'3740'}));
  });
  it('voegt dezelfde naam op een ander huisnummer niet samen',()=>expect(customerKey({name:'Jan',street:'Kerkstraat',house_number:'12',postal_code:'3740'})).not.toBe(customerKey({name:'Jan',street:'Kerkstraat',house_number:'14',postal_code:'3740'})));
  it('behoudt huisnummer en bus uit een gecombineerd adres',()=>expect(splitCustomerAddress('Groenstraat 92 bus 3')).toEqual({street:'Groenstraat',house_number:'92 bus 3'}));
});

describe("customerPatch", () => {
  it("wist lege velden en haalt spaties weg", () => {
    expect(customerPatch({ name: "  Riory  ", street: "   ", postal_code: " 3740 ", project_name: " Nieuwbouw " })).toEqual({
      name: "Riory",
      street: null,
      postal_code: "3740",
      project_name: "Nieuwbouw",
    });
  });
  it("laat een lege naam staan en negeert velden die niet meekomen", () => {
    expect(customerPatch({ name: "   ", email: "x@y.be", city: undefined })).toEqual({ email: "x@y.be" });
  });
});
