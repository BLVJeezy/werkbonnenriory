import { describe, expect, it } from "vitest";
import { CREW_INVITATION_HOURS, crewInvitationUrl, invitationUsable } from "./crew-invitation";

describe("Persoonlijke ploeguitnodiging", () => {
  it("gebruikt 72 uur geldigheid", () => {
    expect(CREW_INVITATION_HOURS).toBe(72);
  });
  it("accepteert alleen nog niet gebruikte, niet verlopen uitnodigingen", () => {
    const row = { expires_at: "2026-11-04T08:00:00Z", consumed_at: null };
    expect(invitationUsable(row, Date.parse("2026-11-01T08:00:00Z"))).toBe(true);
    expect(invitationUsable(row, Date.parse(row.expires_at))).toBe(false);
    expect(invitationUsable({ ...row, consumed_at: "2026-11-01T08:01:00Z" }, Date.parse("2026-11-01T08:02:00Z"))).toBe(false);
  });
  it("zet de code in het fragment van de gepubliceerde pagina", () => {
    const token = "a".repeat(64);
    const url = new URL(crewInvitationUrl(token));
    expect(url.origin).toBe("https://werkbonnenriory.lovable.app");
    expect(url.pathname).toBe("/ploeg-uitnodiging");
    expect(url.hash).toBe(`#${token}`);
    expect(url.search).toBe("");
    expect(() => crewInvitationUrl("ongeldig")).toThrow();
  });
});