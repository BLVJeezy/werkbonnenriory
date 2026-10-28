import { describe, expect, it } from "vitest";
import { quoteSigningLink } from "./quote-signing-link";

describe("quote signing links", () => {
  it("always directs the customer to the public app, independently of the sending environment", () => {
    expect(quoteSigningLink("12345678-1234-1234-1234-123456789abc"))
      .toBe("https://werkbonnenriory.lovable.app/offerte/12345678-1234-1234-1234-123456789abc");
  });
  it("keeps the token within a single path segment", () => {
    expect(quoteSigningLink("invalid/path?value=1"))
      .toBe("https://werkbonnenriory.lovable.app/offerte/invalid%2Fpath%3Fvalue%3D1");
  });
});