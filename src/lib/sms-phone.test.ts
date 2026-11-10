import { describe, expect, it } from "vitest";
import { normalizeMobile, onderwegTemplate } from "./sms-phone";

describe("normalizeMobile", () => {
  it("Belgisch gsm-nummer naar E.164", () => expect(normalizeMobile("0470 12 34 56")).toEqual({ ok: true, e164: "+32470123456" }));
  it("Nederlands gsm-nummer naar E.164", () => expect(normalizeMobile("06-12345678")).toEqual({ ok: true, e164: "+31612345678" }));
  it("00-prefix en (0) na landcode", () => expect(normalizeMobile("0032 (0)470123456")).toEqual({ ok: true, e164: "+32470123456" }));
  it("vaste lijn wordt geweigerd", () => expect(normalizeMobile("089 12 34 56").ok).toBe(false));
  it("Belgische vaste lijn in E.164 wordt geweigerd", () => expect(normalizeMobile("+3289123456").ok).toBe(false));
});

describe("onderwegTemplate", () => {
  it("met klantnaam, zonder aankomsttijd", () => {
    expect(onderwegTemplate("Jan Peeters")).toBe("Riory BV: Beste Jan Peeters, onze technieker is onderweg naar uw adres. Met vriendelijke groeten, Riory BV");
  });
  it("zonder klantnaam", () => expect(onderwegTemplate("")).toContain("Onze technieker is onderweg naar uw adres."));
});
