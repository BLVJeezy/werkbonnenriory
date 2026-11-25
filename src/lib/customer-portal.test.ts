import { describe, expect, it } from "vitest";
import {
  PORTAL_PUBLIC_URL,
  buildPortalAppointmentDescription,
  portalOriginAllowed,
} from "./customer-portal";

describe("customer-portal helpers", () => {
  it("only allows riory.be origins to call the portal API", () => {
    expect(portalOriginAllowed("https://www.riory.be")).toBe(true);
    expect(portalOriginAllowed("https://riory.be")).toBe(true);
    expect(portalOriginAllowed("https://riory-abc123-blvjeezys-projects.vercel.app")).toBe(true);
    expect(portalOriginAllowed("https://evil.example")).toBe(false);
    expect(portalOriginAllowed("https://www.riory.be.evil.example")).toBe(false);
    expect(portalOriginAllowed(null)).toBe(false);
  });

  it("marks portal appointment requests", () => {
    expect(
      buildPortalAppointmentDescription({ description: "Wc verstopt", urgent: true }),
    ).toContain("[Aangevraagd via klantenportaal]");
  });
});

import {
  buildPortalLoginUrl,
  escapeIlike,
  groupPortalProjects,
  invoiceOpenAmount,
  invoicePortalState,
  normalizePortalEmail,
  workOrderStage,
} from "./customer-portal";

describe("customer-portal email login helpers", () => {
  it("normalizes emails and escapes ilike wildcards", () => {
    expect(normalizePortalEmail("  Jason@Gmail.COM ")).toBe("jason@gmail.com");
    expect(escapeIlike("a_b%c\\d@x.be")).toBe("a\\_b\\%c\\\\d@x.be");
  });

  it("puts the login token in the hash and rejects malformed tokens", () => {
    const t = "b".repeat(56);
    expect(buildPortalLoginUrl(t)).toBe(`${PORTAL_PUBLIC_URL}#login=${t}`);
    expect(() => buildPortalLoginUrl("x?y=1")).toThrow();
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

import {
  nextPortalLoginLog,
  portalEmailAllowed,
  portalLoginAllowed,
  sameEmail,
} from "./customer-portal";

describe("customer-portal hardening", () => {
  it("refuses PostgREST wildcards and only accepts exact address matches", () => {
    expect(portalEmailAllowed("a*@gmail.com")).toBe(false);
    expect(portalEmailAllowed("first_last@riory.be")).toBe(true);
    expect(sameEmail(" Jason@Gmail.com ", "jason@gmail.com")).toBe(true);
    expect(sameEmail("jasonX@gmail.com", "jason@gmail.com")).toBe(false);
    expect(sameEmail(null, "jason@gmail.com")).toBe(false);
  });

  it("rate-limits login mails to one per 2 minutes and five per day", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    expect(portalLoginAllowed([], now)).toBe(true);
    expect(portalLoginAllowed(["2026-11-25T11:59:00Z"], now)).toBe(false);
    expect(portalLoginAllowed(["2026-11-25T11:57:00Z"], now)).toBe(true);
    const five = ["01", "03", "05", "07", "09"].map((h) => `2026-11-25T${h}:00:00Z`);
    expect(portalLoginAllowed(five, now)).toBe(false);
    expect(portalLoginAllowed(["2026-11-24T10:00:00Z", ...five.slice(1)], now)).toBe(true);
    expect(nextPortalLoginLog(["2026-11-23T10:00:00Z", "2026-11-25T11:00:00Z"], now)).toEqual([
      "2026-11-25T11:00:00Z",
      now.toISOString(),
    ]);
  });
});
