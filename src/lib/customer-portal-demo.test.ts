import { describe, expect, it } from "vitest";
import { demoDocument, demoInvoices, demoWorkOrders, portalDemoEnabled } from "./customer-portal-demo";

describe("customer portal demo", () => {
  it("is only on for the test account and never in preview", () => {
    expect(portalDemoEnabled("jasonbalongo@gmail.com", false)).toBe(true);
    expect(portalDemoEnabled("jasonbalongo@gmail.com", true)).toBe(false);
    expect(portalDemoEnabled("klant@example.com", false)).toBe(false);
  });
  it("is a realistic history", () => {
    expect(demoWorkOrders().map((w) => w.stage)).toEqual(["aangevraagd", "gepland", "afgewerkt", "afgewerkt", "afgewerkt"]);
    expect(demoInvoices().map((i) => i.state)).toEqual(["open", "betaald", "betaald"]);
  });
  it("renders PDFs", async () => {
    const w = await demoDocument("werkbon", "demo-wo-putje", "Test");
    const f = await demoDocument("factuur", "demo-inv-open", "Test");
    expect(w.pdf.length).toBeGreaterThan(500);
    expect(f.pdf.length).toBeGreaterThan(500);
  });
});

import { brusselsToUtc } from "./customer-portal.server";
describe("brusselsToUtc", () => {
  it("handles winter and summer time", () => {
    expect(new Date(brusselsToUtc("2026-12-01", "08:00")).toISOString()).toBe("2026-12-01T07:00:00.000Z");
    expect(new Date(brusselsToUtc("2026-07-01", "08:00")).toISOString()).toBe("2026-07-01T06:00:00.000Z");
  });
});
