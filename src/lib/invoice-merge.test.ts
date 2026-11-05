import { describe, it, expect } from "vitest";
import { invoiceMergeKey, mergeWorkOrderInvoices } from "./invoice";

describe("bulk invoicing per customer", () => {
  it("one paid and one unpaid work order leaves the unpaid part payable", () => {
    const m = mergeWorkOrderInvoices([
      { number: 1, lines: [{ description: "A", quantity: 1, unit: "u", unitPrice: 100, amount: 100 }], net: 100, vat: 21, total: 121, paidAmount: 121 },
      { number: 2, lines: [{ description: "B", quantity: 1, unit: "u", unitPrice: 50, amount: 50 }], net: 50, vat: 10.5, total: 60.5, paidAmount: 0 },
    ]);
    expect(m.total).toBe(181.5);
    expect(m.paidAmount).toBe(121);
    expect(m.total - m.paidAmount).toBe(60.5);
    expect(m.lines.map((l) => l.group)).toEqual(["Werkbon 1", "Werkbon 2"]);
  });
  it("same customer shares a key, different customers do not", () => {
    expect(invoiceMergeKey({ customer_id: "c1", vat_rate: 21 })).toBe(invoiceMergeKey({ customer_id: "c1", vat_rate: "21" }));
    expect(invoiceMergeKey({ customer_id: "c1", vat_rate: 21 })).not.toBe(invoiceMergeKey({ customer_id: "c2", vat_rate: 21 }));
  });
});
