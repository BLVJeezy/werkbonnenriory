import { describe, expect, it } from "vitest";
import { invoiceRowState, workOrderRowState } from "./invoice-row-state";

const inv = (o: Partial<{ kind: string; total: number; paid_amount: number; due_date: string }>) => ({
  kind: "factuur",
  total: 500,
  paid_amount: 0,
  due_date: "2026-10-14",
  ...o,
});

describe("invoiceRowState", () => {
  it("toont een volledig betaalde factuur als betaald", () => {
    expect(invoiceRowState(inv({ paid_amount: 500 }), "2026-10-31")).toBe("paid");
  });
  it("toont een open factuur vóór de vervaldag als open", () => {
    expect(invoiceRowState(inv({ due_date: "2026-11-14" }), "2026-10-31")).toBe("open");
  });
  it("toont een onbetaalde factuur na de vervaldag als vervallen", () => {
    expect(invoiceRowState(inv({ due_date: "2026-10-14" }), "2026-10-31")).toBe("overdue");
  });
  it("is op de vervaldag zelf nog niet vervallen", () => {
    expect(invoiceRowState(inv({ due_date: "2026-10-31" }), "2026-10-31")).toBe("open");
  });
  it("merkt een deels betaalde factuur met verstreken vervaldag als vervallen", () => {
    expect(invoiceRowState(inv({ paid_amount: 200, due_date: "2026-10-14" }), "2026-10-31")).toBe("overdue");
  });
  it("houdt een niet-verrekende creditnota open, nooit vervallen", () => {
    expect(invoiceRowState(inv({ kind: "creditnota", total: -500, paid_amount: 0, due_date: "2026-10-14" }), "2026-10-31")).toBe("open");
  });
  it("kleurt een volledig verrekende creditnota als betaald", () => {
    expect(invoiceRowState(inv({ kind: "creditnota", total: -500, paid_amount: -500, due_date: "2026-10-14" }), "2026-10-31")).toBe("paid");
  });
});

describe("workOrderRowState", () => {
  it("is betaald zodra een betaling is genoteerd", () => {
    expect(workOrderRowState({ paid_at: "2026-10-30T10:00:00Z" })).toBe("paid");
  });
  it("blijft open zolang er geen betaling is genoteerd", () => {
    expect(workOrderRowState({ paid_at: null })).toBe("open");
  });
});
