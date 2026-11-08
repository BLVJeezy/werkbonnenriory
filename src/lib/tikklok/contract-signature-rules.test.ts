import { describe, expect, it } from "vitest";
import { canEmployerSign, canEditContractText, validateDrawnSignature } from "./contract-signature-rules";

describe("Expliciete ondertekening door de zaakvoerder", () => {
  it("vereist een getekende PNG-handtekening", () => {
    expect(() => validateDrawnSignature("")).toThrow();
    expect(() => validateDrawnSignature("data:image/svg+xml;base64," + "A".repeat(200))).toThrow();
    const png = "data:image/png;base64," + "A".repeat(200);
    expect(validateDrawnSignature(png)).toBe(png);
  });
  it("laat de zaakvoerder ook na de werknemer tekenen, zonder zijn handtekening te overschrijven", () => {
    expect(canEmployerSign({ status: "signed", employer_signature_image: null })).toBe(true);
    expect(canEmployerSign({ status: "signed", employer_signature_image: "bestaand" })).toBe(false);
    expect(canEmployerSign({ status: "archived" })).toBe(false);
  });
  it("bewaart de contracttekst zodra een partij heeft getekend", () => {
    expect(canEditContractText({ status: "draft" })).toBe(true);
    expect(canEditContractText({ status: "draft", employer_signature_image: "getekend" })).toBe(false);
    expect(canEditContractText({ status: "signed", employee_signed_at: "2026-10-30" })).toBe(false);
  });
});