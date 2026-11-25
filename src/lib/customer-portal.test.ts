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
    expect(buildPortalInviteUrl(token)).toBe(`${PORTAL_BASE_URL}/portaal/uitnodiging#${token}`);
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
import {
  buildPortalLoginUrl,
  escapeIlike,
  groupPortalProjects,
  invoiceOpenAmount,
  invoicePortalState,
  normalizePortalEmail,
  portalLoginThrottled,
  workOrderStage,
} from "./customer-portal";

describe("customer-portal email login helpers", () => {
  it("normalizes emails and escapes ilike wildcards", () => {
    expect(normalizePortalEmail("  Jason@Gmail.COM ")).toBe("jason@gmail.com");
    expect(escapeIlike("a_b%c\\d@x.be")).toBe("a\\_b\\%c\\\\d@x.be");
  });

  it("puts the login token in the hash and rejects malformed tokens", () => {
    const t = "b".repeat(56);
    expect(buildPortalLoginUrl(t)).toBe(`${PORTAL_BASE_URL}/portaal/inloggen#login=${t}`);
    expect(() => buildPortalLoginUrl("x?y=1")).toThrow();
  });

  it("throttles login mails for 60 seconds", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    expect(portalLoginThrottled(null, now)).toBe(false);
    expect(portalLoginThrottled("2026-11-25T11:59:30Z", now)).toBe(true);
    expect(portalLoginThrottled("2026-11-25T11:58:59Z", now)).toBe(false);
  });
});

describe("customer-portal display helpers", () => {
  it("maps work order statuses to customer stages", () => {
    expect(workOrderStage({ status: "nieuw", scheduled_date: null })).toBe("aangevraagd");
    expect(workOrderStage({ status: "toegewezen", scheduled_date: null })).toBe("gepland");
    expect(workOrderStage({ status: "nieuw", scheduled_date: "2026-12-01" })).toBe("gepland");
    expect(workOrderStage({ status: "offerte", scheduled_date: null })).toBe("offerte");
    expect(workOrderStage({ status: "afgetekend", scheduled_date: "2026-11-01" })).toBe(
      "afgewerkt",
    );
  });

  it("derives invoice state from payments and due date", () => {
    const today = new Date("2026-11-25T10:00:00");
    expect(
      invoicePortalState({ total: 100, paid_amount: 100, due_date: "2026-11-01" }, today),
    ).toBe("betaald");
    expect(invoicePortalState({ total: 100, paid_amount: 40, due_date: "2026-11-01" }, today)).toBe(
      "vervallen",
    );
    expect(invoicePortalState({ total: 100, paid_amount: 0, due_date: "2026-11-25" }, today)).toBe(
      "open",
    );
    expect(invoicePortalState({ kind: "creditnota", total: -50 }, today)).toBe("creditnota");
    expect(invoiceOpenAmount({ total: 100, paid_amount: 40 })).toBe(60);
    expect(invoiceOpenAmount({ kind: "creditnota", total: -50 })).toBe(0);
  });

  it("groups work orders per project name, else per work address", () => {
    const groups = groupPortalProjects([
      {
        id: "1",
        project_name: "Renovatie badkamer",
        street: "Kerkstraat",
        house_number: "1",
        postal_code: "3740",
        city: "Bilzen",
      },
      {
        id: "2",
        project_name: null,
        street: "Kerkstraat",
        house_number: "1",
        postal_code: "3740",
        city: "Bilzen",
      },
      { id: "3", project_name: "renovatie badkamer" },
      {
        id: "4",
        project_name: null,
        use_site_address: true,
        site_street: "Markt",
        site_house_number: "2",
        site_postal_code: "3700",
        site_city: "Tongeren",
        street: "Kerkstraat",
        house_number: "1",
      },
    ]);
    expect(groups.map((g) => [g.title, g.items.map((i) => i.id)])).toEqual([
      ["Renovatie badkamer", ["1", "3"]],
      ["Kerkstraat 1, 3740 Bilzen", ["2"]],
      ["Markt 2, 3700 Tongeren", ["4"]],
    ]);
  });
});
