import { describe, expect, it } from "vitest";
import {
  PORTAL_BASE_URL,
  buildPortalAppointmentDescription,
  buildPortalInviteUrl,
  portalInvitationUsable,
  sanitizePortalNext,
} from "./customer-portal";

describe("customer-portal helpers", () => {
  it("builds invite URL on werkbonnen.riory.be with token in hash fragment", () => {
    const token = "a".repeat(64);
    expect(buildPortalInviteUrl(token)).toBe(
      `${PORTAL_BASE_URL}/portaal/uitnodiging#${token}`,
    );
  });

  it("sanitizes next parameter to stay strictly inside /portaal", () => {
    expect(sanitizePortalNext("/portaal")).toBe("/portaal");
    expect(sanitizePortalNext("/portaal?actie=afspraak")).toBe("/portaal?actie=afspraak");
    expect(sanitizePortalNext("https://evil.example/phish")).toBe("/portaal");
    expect(sanitizePortalNext("//evil.example/phish")).toBe("/portaal");
    expect(sanitizePortalNext("/dashboard")).toBe("/portaal");
    expect(sanitizePortalNext("/portaal/inloggen")).toBe("/portaal");
    expect(sanitizePortalNext(undefined)).toBe("/portaal");
  });

  it("validates invitation expiry and single-use consumption", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    expect(
      portalInvitationUsable({ expires_at: "2026-11-27T12:00:00Z", consumed_at: null }, now),
    ).toBe(true);
    expect(
      portalInvitationUsable({ expires_at: "2026-11-24T11:59:59Z", consumed_at: null }, now),
    ).toBe(false);
    expect(
      portalInvitationUsable(
        { expires_at: "2026-11-27T12:00:00Z", consumed_at: "2026-11-24T12:00:00Z" },
        now,
      ),
    ).toBe(false);
  });

  it("formats portal appointment description for Kalender -> Nog in te plannen", () => {
    const text = buildPortalAppointmentDescription({
      description: "Verstopping keukenafvoer",
      preferredWindow: "Donderdag voormiddag",
      contactPhone: "0470 12 34 56",
      urgent: true,
    });
    expect(text).toContain("Verstopping keukenafvoer");
    expect(text).toContain("Voorkeur moment: Donderdag voormiddag");
    expect(text).toContain("Contacttelefoon aanvraag: 0470 12 34 56");
    expect(text).toContain("Aangeduid als dringend door klant.");
    expect(text).toContain("[Aangevraagd via klantenportaal]");
  });
});