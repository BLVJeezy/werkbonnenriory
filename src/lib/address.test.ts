import { describe, expect, it } from "vitest";
import { addressLines, destinationLabel, destinationLines, destinationAddress, formatAddress } from "./address";

describe("formatAddress", () => {
  it("joins street, number, postal code and city", () => {
    expect(formatAddress({ street: "Kerkstraat", house_number: "12", postal_code: "9000", city: "Gent" })).toBe(
      "Kerkstraat 12, 9000 Gent",
    );
  });
  it("returns null when empty", () => {
    expect(formatAddress({ street: "", city: null })).toBeNull();
  });
});

describe("werfadres", () => {
  const address = { address: "Kerkstraat 12, 9000 Gent", site_street: "Werfstraat", site_house_number: "7", site_postal_code: "3740", site_city: "Bilzen" };
  it("uses the separate worksite only when checked", () => {
    expect(destinationAddress({ ...address, use_site_address: true })).toBe("Werfstraat 7, 3740 Bilzen");
    expect(destinationAddress({ ...address, use_site_address: false })).toBe("Kerkstraat 12, 9000 Gent");
  });
  it("does not silently route to the customer when the checked worksite is empty", () => {
    expect(destinationAddress({ address: address.address, use_site_address: true })).toBeNull();
  });
});

describe("adresregels voor de ploeg", () => {
  it("telt elke adresregel apart op, lege delen vallen weg", () => {
    expect(addressLines({ street: " Kerkstraat ", house_number: "12", postal_code: "9000", city: "Gent" })).toEqual([
      "Kerkstraat 12",
      "9000 Gent",
    ]);
    expect(addressLines({ street: "Kerkstraat", house_number: null, postal_code: "", city: null })).toEqual(["Kerkstraat"]);
    expect(addressLines({ street: null, city: null })).toEqual([]);
  });
  it("gebruikt de werfregels when apart werfadres is aangevinkt", () => {
    const wo = { address: "Kerkstraat 12, 9000 Gent", use_site_address: true, site_street: "Werfstraat", site_house_number: "7", site_postal_code: "3740", site_city: "Bilzen" };
    expect(destinationLines(wo)).toEqual(["Werfstraat 7", "3740 Bilzen"]);
    expect(destinationLabel(wo)).toBe("Werfadres");
    expect(destinationLines({ ...wo, use_site_address: false })).toEqual(["Kerkstraat 12, 9000 Gent"]);
    expect(destinationLabel({ use_site_address: false })).toBe("Adres");
  });
  it("valt terug op straat en plaats als het samengevoegde veld leeg is", () => {
    expect(destinationLines({ address: "", street: "Kerkstraat", house_number: "12", postal_code: "3740", city: "Bilzen" })).toEqual([
      "Kerkstraat 12",
      "3740 Bilzen",
    ]);
  });
});
