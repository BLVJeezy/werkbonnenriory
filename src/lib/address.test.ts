import { describe, expect, it } from "vitest";
import { formatAddress } from "./address";

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
