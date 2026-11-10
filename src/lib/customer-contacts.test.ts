import { describe, expect, it } from "vitest";
import { hasContact, parseContacts, upsertContact } from "./customer-contacts";

describe("customer contacts", () => {
  it("adds a new contact and updates an existing one by name without duplicates", () => {
    let list = upsertContact([], { name: "Jan Peeters", phone: "0470 11 22 33", role: "conciërge" });
    list = upsertContact(list, { name: "jan peeters", phone: "0499 00 00 00" });
    expect(list).toEqual([{ name: "jan peeters", phone: "0499 00 00 00", role: "conciërge" }]);
    expect(hasContact(list, "Jan Peeters", "0499000000")).toBe(true);
  });
  it("ignores invalid stored data", () => {
    expect(parseContacts(null)).toEqual([]);
    expect(parseContacts([{ name: "", phone: "" }, { name: "An" }])).toEqual([{ name: "An", phone: "", role: "" }]);
  });
});

import { addMailContact } from "./customer-contacts";
describe("addMailContact", () => {
  it("voegt de contactpersoon uit de mail toe aan de VME", () => {
    expect(addMailContact([], "Marc Janssens", "0470 12 34 56")).toEqual([{ name: "Marc Janssens", phone: "0470 12 34 56", role: "" }]);
  });
  it("wist geen bestaand nummer of rol als de mail geen nummer bevat", () => {
    const list = [{ name: "Marc Janssens", phone: "0470 12 34 56", role: "conciërge" }];
    expect(addMailContact(list, "marc janssens", null)).toEqual([{ name: "marc janssens", phone: "0470 12 34 56", role: "conciërge" }]);
  });
  it("doet niets zonder naam en nummer", () => {
    expect(addMailContact([], null, " ")).toEqual([]);
  });
});
