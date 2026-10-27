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
