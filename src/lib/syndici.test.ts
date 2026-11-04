import { describe, expect, it } from "vitest";
import {
  customerDetailsFromDir,
  dirFromCustomer,
  mergeSyndicusDir,
  syndicusDirPatch,
  syndicusGroups,
  syndicusKey,
  type SyndicusDir,
} from "./syndici";

const fiche = {
  id: "1",
  company: "Immo Schrijnemakers BV",
  contact: "Olivier",
  vat_number: null,
  street: null,
  house_number: null,
  postal_code: null,
  city: null,
  phone: null,
  email: null,
  billing_email: null,
} as SyndicusDir;

describe("syndicusKey", () => {
  it("herkent dezelfde syndicus ondanks letters, accenten en spaties", () => {
    expect(syndicusKey("  IMMO schrijnemakers  BV ")).toBe(syndicusKey("immo Schrijnemakers BV"));
    expect(syndicusKey("Syndicus Wégman")).toBe(syndicusKey("syndicus wegman"));
    expect(syndicusKey("")).toBe("");
    expect(syndicusKey(null)).toBe("");
  });
});

describe("syndicusDirPatch", () => {
  it("wist lege velden en weigert een fiche zonder bedrijfsnaam", () => {
    expect(syndicusDirPatch({ company: " Immo BV ", phone: "  ", email: "info@x.be" })).toEqual({
      company: "Immo BV",
      contact: null,
      vat_number: null,
      street: null,
      house_number: null,
      postal_code: null,
      city: null,
      phone: null,
      email: "info@x.be",
      billing_email: null,
    });
    expect(() => syndicusDirPatch({ company: "   " })).toThrow(/bedrijfsnaam/);
  });
});

describe("contactfiche en klantkoppie", () => {
  it("zet elke fichekolom om naar het juiste klantveld en terug", () => {
    const kopie = customerDetailsFromDir({
      company: "Immo BV",
      contact: "Olivier",
      vat_number: "BE0123",
      street: "Wasserijstraat",
      house_number: "2",
      postal_code: "3590",
      city: "Diepenbeek",
      phone: "0470",
      email: "info@b",
      billing_email: "boek@b",
    });
    expect(kopie.syndicus_company).toBe("Immo BV");
    expect(kopie.syndicus_billing_email).toBe("boek@b");
    expect(Object.keys(kopie)).toHaveLength(10);
    const terug = dirFromCustomer(kopie);
    expect(terug.company).toBe("Immo BV");
    expect(terug.billing_email).toBe("boek@b");
    expect(terug.phone).toBe("0470");
  });
});

describe("mergeSyndicusDir", () => {
  it("laat een ingevuld veld winnen en een leeg veld het bestaande staan", () => {
    const merged = mergeSyndicusDir(
      { company: "Immo BV", phone: "0470 00 00 00", email: "info@b" },
      { company: "immo bv", phone: "0480 11 22 33", email: "   " },
    );
    expect(merged.phone).toBe("0480 11 22 33");
    expect(merged.email).toBe("info@b");
    expect(merged.company).toBe("immo bv");
    expect(merged.contact).toBe(null);
  });
});

describe("syndicusGroups", () => {
  const vme = {
    id: "c1",
    name: "VME Parkzicht",
    syndicus: "Immo Schrijnemakers BV – Olivier",
    syndicus_company: "Immo Schrijnemakers BV",
  };
  const losse = { id: "c2", name: "VME Zonne", syndicus: "Syndicaat Maas", syndicus_company: null };

  it("voegt fiches en klanten bij elkaar, ook een fiche zonder VME", () => {
    const g = syndicusGroups([vme, losse], [fiche, { ...fiche, id: "9", company: "Nieuwe Syndicus BV", contact: null }]);
    expect(g.map((x) => [x.label, x.rows.length, x.dir?.id ?? null])).toEqual([
      ["Immo Schrijnemakers BV – Olivier", 1, "1"],
      ["Nieuwe Syndicus BV", 0, "9"],
      ["Syndicaat Maas", 1, null],
    ]);
  });

  it("koppelt een klant aan zijn fiche ondanks een andere schrijfwijze", () => {
    const g = syndicusGroups(
      [{ id: "c3", name: "VME Twee", syndicus: null, syndicus_company: "immo  schrijnemakers bv" }],
      [fiche],
    );
    expect(g).toHaveLength(1);
    expect(g[0]?.rows.map((r) => r.id)).toEqual(["c3"]);
    expect(g[0]?.dir?.id).toBe("1");
    expect(g[0]?.label).toBe("Immo Schrijnemakers BV – Olivier");
  });

  it("zet de residenties van een syndicus op naam", () => {
    const g = syndicusGroups(
      [
        { id: "z", name: "VME Zonne", syndicus: "Syndicaat Maas", syndicus_company: null },
        { id: "a", name: "VME Astrid", syndicus: "Syndicaat Maas", syndicus_company: null },
      ],
      [],
    );
    expect(g[0]?.rows.map((r) => r.name)).toEqual(["VME Astrid", "VME Zonne"]);
  });
});
