import { describe, expect, it, vi } from "vitest";
import { allCustomers, customerKey, customerPatch, rowsToCustomers, splitCustomerAddress } from "./customers";

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

describe("allCustomers", () => {
  it("vraagt de nieuwste klanten eerst op en behoudt alle pagina's", async () => {
    const newest = Array.from({ length: 1000 }, (_, i) => ({ id: `new-${i}`, created_at: "2026-10-29" }));
    const oldest = { id: "older", created_at: "2026-10-28" };
    const range = vi.fn().mockResolvedValueOnce({ data: newest, error: null }).mockResolvedValueOnce({ data: [oldest], error: null });
    const order = vi.fn();
    const builder = { select: vi.fn(), order, range };
    builder.select.mockReturnValue(builder);
    order.mockReturnValue(builder);
    const rows = await allCustomers({ from: () => builder });
    expect(order).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(order).toHaveBeenNthCalledWith(2, "id");
    expect(range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(rows).toHaveLength(1001);
    expect(rows[0].id).toBe("new-0");
    expect(rows[1000].id).toBe("older");
  });
});
