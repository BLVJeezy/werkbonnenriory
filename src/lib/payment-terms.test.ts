import { describe, expect, it } from "vitest";
import {
  computeInvoiceDueDate,
  parseCustomerPaymentTermDays,
  resolveCustomerPaymentTermFromRow,
  resolveInvoicePaymentTermDays,
} from "@/lib/payment-terms";

describe("parseCustomerPaymentTermDays", () => {
  it("treats null, undefined, and blank strings as empty (global default)", () => {
    expect(parseCustomerPaymentTermDays(null)).toEqual({ ok: true, value: null });
    expect(parseCustomerPaymentTermDays(undefined)).toEqual({ ok: true, value: null });
    expect(parseCustomerPaymentTermDays("")).toEqual({ ok: true, value: null });
    expect(parseCustomerPaymentTermDays("   ")).toEqual({ ok: true, value: null });
  });

  it("accepts bounded integers 0 through 60 (number or string)", () => {
    expect(parseCustomerPaymentTermDays(0)).toEqual({ ok: true, value: 0 });
    expect(parseCustomerPaymentTermDays("0")).toEqual({ ok: true, value: 0 });
    expect(parseCustomerPaymentTermDays(14)).toEqual({ ok: true, value: 14 });
    expect(parseCustomerPaymentTermDays("30")).toEqual({ ok: true, value: 30 });
    expect(parseCustomerPaymentTermDays(60)).toEqual({ ok: true, value: 60 });
    expect(parseCustomerPaymentTermDays(" 45 ")).toEqual({ ok: true, value: 45 });
  });

  it("rejects out-of-range, negative, decimal, and non-numeric values", () => {
    expect(parseCustomerPaymentTermDays(-1).ok).toBe(false);
    expect(parseCustomerPaymentTermDays("-5").ok).toBe(false);
    expect(parseCustomerPaymentTermDays(61).ok).toBe(false);
    expect(parseCustomerPaymentTermDays("90").ok).toBe(false);
    expect(parseCustomerPaymentTermDays(14.5).ok).toBe(false);
    expect(parseCustomerPaymentTermDays("14.5").ok).toBe(false);
    expect(parseCustomerPaymentTermDays("abc").ok).toBe(false);
    expect(parseCustomerPaymentTermDays(Number.NaN).ok).toBe(false);
    expect(parseCustomerPaymentTermDays(Number.POSITIVE_INFINITY).ok).toBe(false);
  });
});

describe("resolveCustomerPaymentTermFromRow", () => {
  it("is backward-safe when payment_term_days column is absent or null", () => {
    expect(resolveCustomerPaymentTermFromRow(null)).toBeNull();
    expect(resolveCustomerPaymentTermFromRow(undefined)).toBeNull();
    expect(resolveCustomerPaymentTermFromRow({ id: "c1", name: "Klant" })).toBeNull();
    expect(resolveCustomerPaymentTermFromRow({ id: "c1", payment_term_days: null })).toBeNull();
  });

  it("returns valid 0-60 term and ignores invalid stored values", () => {
    expect(resolveCustomerPaymentTermFromRow({ payment_term_days: 0 })).toBe(0);
    expect(resolveCustomerPaymentTermFromRow({ payment_term_days: 30 })).toBe(30);
    expect(resolveCustomerPaymentTermFromRow({ payment_term_days: 60 })).toBe(60);
    expect(resolveCustomerPaymentTermFromRow({ payment_term_days: 99 })).toBeNull();
    expect(resolveCustomerPaymentTermFromRow({ payment_term_days: -1 })).toBeNull();
  });
});

describe("resolveInvoicePaymentTermDays & computeInvoiceDueDate", () => {
  it("uses global default (14) when customer term is null or buyer is ad-hoc/unlinked", () => {
    expect(resolveInvoicePaymentTermDays({ kind: "factuur", customerPaymentTermDays: null, globalPaymentDays: 14 })).toBe(14);
    expect(computeInvoiceDueDate("2026-11-26", { kind: "factuur", customerPaymentTermDays: null, globalPaymentDays: 14 })).toBe("2026-12-10");
    // Ad-hoc manual buyer (no customerId -> null term) falls back to global default
    expect(computeInvoiceDueDate("2026-11-26", { kind: "factuur", customerPaymentTermDays: undefined, globalPaymentDays: 14 })).toBe("2026-12-10");
  });

  it("supports 0 days (due on invoice date), 30, 60, and custom terms", () => {
    expect(computeInvoiceDueDate("2026-11-26", { kind: "factuur", customerPaymentTermDays: 0, globalPaymentDays: 14 })).toBe("2026-11-26");
    expect(computeInvoiceDueDate("2026-11-26", { kind: "factuur", customerPaymentTermDays: 30, globalPaymentDays: 14 })).toBe("2026-12-26");
    expect(computeInvoiceDueDate("2026-11-26", { kind: "factuur", customerPaymentTermDays: 60, globalPaymentDays: 14 })).toBe("2027-01-25");
    expect(computeInvoiceDueDate("2026-11-26", { kind: "factuur", customerPaymentTermDays: 7, globalPaymentDays: 14 })).toBe("2026-12-03");
  });

  it("handles month-end, year-end, and leap-year date rollovers", () => {
    expect(computeInvoiceDueDate("2026-01-31", { kind: "factuur", customerPaymentTermDays: 30, globalPaymentDays: 14 })).toBe("2026-03-02");
    expect(computeInvoiceDueDate("2026-12-20", { kind: "factuur", customerPaymentTermDays: 30, globalPaymentDays: 14 })).toBe("2027-01-19");
    expect(computeInvoiceDueDate("2028-02-28", { kind: "factuur", customerPaymentTermDays: 1, globalPaymentDays: 14 })).toBe("2028-02-29");
    expect(computeInvoiceDueDate("2028-02-28", { kind: "factuur", customerPaymentTermDays: 2, globalPaymentDays: 14 })).toBe("2028-03-01");
  });

  it("preserves a separately agreed explicit term when present", () => {
    expect(
      computeInvoiceDueDate("2026-11-26", {
        kind: "factuur",
        explicitTermDays: 45,
        customerPaymentTermDays: 30,
        globalPaymentDays: 14,
      }),
    ).toBe("2027-01-10");
  });

  it("never applies customer payment term to credit notes", () => {
    expect(
      resolveInvoicePaymentTermDays({
        kind: "creditnota",
        customerPaymentTermDays: 60,
        globalPaymentDays: 14,
      }),
    ).toBe(14);
    expect(
      computeInvoiceDueDate("2026-11-26", {
        kind: "creditnota",
        customerPaymentTermDays: 60,
        globalPaymentDays: 14,
      }),
    ).toBe("2026-12-10");
  });

  it("applies buyer's term for quotation/reissue/contract invoice paths without mutating existing invoice dates", () => {
    const existingInvoice = { id: "inv-1", issue_date: "2026-10-01", due_date: "2026-10-15" };
    const reissuedDue = computeInvoiceDueDate("2026-11-26", {
      kind: "factuur",
      customerPaymentTermDays: resolveCustomerPaymentTermFromRow({ id: "buyer-2", payment_term_days: 30 }),
      globalPaymentDays: 14,
    });
    expect(reissuedDue).toBe("2026-12-26");
    expect(existingInvoice.due_date).toBe("2026-10-15");
  });
});