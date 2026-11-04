import { expect, it } from "vitest";
import { findPurchaseDuplicates } from "./purchase-duplicates";

const r = (id: string, o: Partial<Parameters<typeof findPurchaseDuplicates>[0][number]> = {}) => ({ id, supplier_name: "Deschacht", invoice_number: "F-1", invoice_date: "2026-11-01", total: 100, created_at: `2026-11-0${id}`, ...o });

it("markeert dezelfde leverancier met hetzelfde factuurnummer als dubbel van de oudste", () => {
  expect(findPurchaseDuplicates([r("2", { invoice_number: "f 1" }), r("1")]).get("2")).toBe("1");
});
it("andere leverancier met hetzelfde nummer is geen dubbel", () => {
  expect(findPurchaseDuplicates([r("1"), r("2", { supplier_name: "Gamma" })]).size).toBe(0);
});
it("zonder nummer: zelfde datum en bedrag is dubbel, ander bedrag niet", () => {
  expect(findPurchaseDuplicates([r("1", { invoice_number: null }), r("2", { invoice_number: null })]).get("2")).toBe("1");
  expect(findPurchaseDuplicates([r("1", { invoice_number: null }), r("2", { invoice_number: null, total: 99 })]).size).toBe(0);
});
