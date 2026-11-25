import { describe, expect, it } from "vitest";
import { demoDocument, demoInvoices, demoWorkOrders, portalDemoEnabled } from "./customer-portal-demo";

describe("customer portal demo", () => {
  it("is only on for the test account and never in preview", () => {
    expect(portalDemoEnabled("jasonbalongo@gmail.com", false)).toBe(true);
    expect(portalDemoEnabled("jasonbalongo@gmail.com", true)).toBe(false);
    expect(portalDemoEnabled("klant@example.com", false)).toBe(false);
  });
  it("covers every stage and invoice state", () => {
    expect(new Set(demoWorkOrders().map((w) => w.stage))).toEqual(
      new Set(["aangevraagd", "offerte", "gepland", "afgewerkt"]),
    );
    expect(new Set(demoInvoices().map((i) => i.state))).toEqual(
      new Set(["open", "vervallen", "betaald", "creditnota"]),
    );
  });
  it("renders PDFs", async () => {
    const w = await demoDocument("werkbon", "demo-wo-afgewerkt", "Test");
    const f = await demoDocument("factuur", "demo-inv-credit", "Test");
    expect(w.pdf.length).toBeGreaterThan(500);
    expect(f.pdf.length).toBeGreaterThan(500);
  });
});
