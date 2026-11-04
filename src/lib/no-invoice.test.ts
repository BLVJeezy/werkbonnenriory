import { describe, expect, it } from "vitest";
import { canInvoiceWorkOrder } from "./invoice";

describe("canInvoiceWorkOrder", () => {
  it("factureert een afgetekende werkbon", () => {
    expect(canInvoiceWorkOrder({ status: "afgetekend" })).toBe(true);
  });
  it("factureert een open taak niet", () => {
    expect(canInvoiceWorkOrder({ status: "toegewezen" })).toBe(false);
  });
  it("factureert een contractbon nooit", () => {
    expect(canInvoiceWorkOrder({ status: "afgetekend", contract_id: "c1" })).toBe(false);
  });
  it("factureert een bon met het label 'niet factureren' niet (bijv. garantie-terugkeer)", () => {
    expect(canInvoiceWorkOrder({ status: "afgetekend", no_invoice: true })).toBe(false);
  });
  it("factureert weer zodra het label verwijderd is", () => {
    expect(canInvoiceWorkOrder({ status: "afgetekend", no_invoice: false })).toBe(true);
  });
});
