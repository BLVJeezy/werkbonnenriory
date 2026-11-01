import { describe, expect, it } from "vitest";
import { crewWhatsAppLink } from "./crew-whatsapp";

describe("WhatsApp-uitnodiging voor ploegen", () => {
  it("gebruikt het Belgische nummer en de gepubliceerde inlogpagina", () => {
    const url = new URL(crewWhatsAppLink("Testploeg", "0470 12 34 56"));
    expect(url.pathname).toBe("/32470123456");
    expect(url.searchParams.get("text")).toContain("https://werkbonnenriory.lovable.app/auth");
  });
  it("behoudt buitenlandse landcodes", () => {
    expect(new URL(crewWhatsAppLink("Ploeg", "+31 6 12345678")).pathname).toBe("/31612345678");
    expect(new URL(crewWhatsAppLink("Ploeg", "0031 6 12345678")).pathname).toBe("/31612345678");
  });
  it("weigert een ontbrekend of ongeldig nummer", () => {
    expect(() => crewWhatsAppLink("Ploeg", "")).toThrow();
    expect(() => crewWhatsAppLink("Ploeg", "0470abc123456")).toThrow();
  });
  it("deelt de persoonlijke wachtwoordkeuze via de gepubliceerde pagina", () => {
    const setupUrl = `https://werkbonnenriory.lovable.app/ploeg-uitnodiging#${"a".repeat(64)}`;
    const text = new URL(crewWhatsAppLink("Ploeg", "0470123456", setupUrl)).searchParams.get("text");
    expect(text).toContain(setupUrl);
    expect(() => crewWhatsAppLink("Ploeg", "0470123456", "https://ander.example/")).toThrow();
  });
});