import { describe, expect, it } from "vitest";
import { computeAutoAllocation, sameLegalCustomer, unallocatedCustomerCredits, validateManualCreditAllocation } from "./credit-note-allocation";

describe("credit-note auto allocation", () => {
  it("verrekent volledig op een onbetaalde factuur zonder resttegoed", () => {
    const res = computeAutoAllocation(-300, 0, 300, 0);
    expect(res).toEqual({
      creditOpenBefore: 300,
      originOpenBefore: 300,
      allocateAmount: 300,
      surplusCustomerCredit: 0,
      originOpenAfter: 0,
      status: "settled",
    });
  });

  it("verrekent eerst het restsaldo bij een gedeeltelijk betaalde factuur en zet het overschot op klanttegoed", () => {
    const res = computeAutoAllocation(-300, 0, 300, 120);
    expect(res.allocateAmount).toBe(180);
    expect(res.originOpenAfter).toBe(0);
    expect(res.surplusCustomerCredit).toBe(120);
    expect(res.status).toBe("partial_credit");
  });

  it("zet volledige creditnota als klanttegoed wanneer de oorspronkelijke factuur al volledig betaald is", () => {
    const res = computeAutoAllocation(-250, 0, 250, 250);
    expect(res.allocateAmount).toBe(0);
    expect(res.originOpenAfter).toBe(0);
    expect(res.surplusCustomerCredit).toBe(250);
    expect(res.status).toBe("customer_credit");
  });

  it("verrekent gedeeltelijke creditering correct zonder negatief saldo", () => {
    const res = computeAutoAllocation(-100, 0, 300, 0);
    expect(res.allocateAmount).toBe(100);
    expect(res.originOpenAfter).toBe(200);
    expect(res.surplusCustomerCredit).toBe(0);
    expect(res.status).toBe("settled");
  });

  it("verrekent niet dubbel bij herhaalde aanroep nadat de creditnota al verrekend is", () => {
    const first = computeAutoAllocation(-300, 0, 300, 0);
    const second = computeAutoAllocation(-300, -first.allocateAmount, 300, first.allocateAmount);
    expect(second.allocateAmount).toBe(0);
    expect(second.surplusCustomerCredit).toBe(0);
    expect(second.originOpenAfter).toBe(0);
  });
});

describe("sameLegalCustomer & manual allocation validation", () => {
  it("herkent dezelfde klant via genormaliseerd btw-nummer", () => {
    expect(sameLegalCustomer({ name: "Riory BV", vatNumber: "BE 0840.931.404" }, { name: "Riory", vatNumber: "be0840931404" })).toBe(true);
  });

  it("weigert verschillende klanten op basis van btw-nummer of naam", () => {
    expect(sameLegalCustomer({ name: "Klant A", vatNumber: "BE0111111111" }, { name: "Klant A", vatNumber: "BE0222222222" })).toBe(false);
    expect(sameLegalCustomer({ name: "Jan Peeters" }, { name: "Piet Janssens" })).toBe(false);
  });

  it("blokkeert handmatige verrekening met een andere klant", () => {
    const err = validateManualCreditAllocation({
      creditOpen: 120,
      invoiceOpen: 200,
      requestedAmount: 120,
      creditCustomer: { name: "Klant A", vatNumber: "BE0111111111" },
      invoiceCustomer: { name: "Klant B", vatNumber: "BE0222222222" },
    });
    expect(err).toContain("dezelfde klant");
  });

  it("staat gedeeltelijke verrekening toe op een volgende factuur van dezelfde klant", () => {
    const err = validateManualCreditAllocation({
      creditOpen: 120,
      invoiceOpen: 200,
      requestedAmount: 80,
      creditCustomer: { name: "Klant A", vatNumber: "BE0111111111" },
      invoiceCustomer: { name: "Klant A BV", vatNumber: "BE 0111.111.111" },
    });
    expect(err).toBeNull();
  });

  it("blokkeert oververrekening boven openstaand tegoed of factuursaldo", () => {
    expect(validateManualCreditAllocation({
      creditOpen: 100,
      invoiceOpen: 200,
      requestedAmount: 150,
      creditCustomer: { name: "Klant A" },
      invoiceCustomer: { name: "Klant A" },
    })).toContain("klanttegoed");
    expect(validateManualCreditAllocation({
      creditOpen: 200,
      invoiceOpen: 100,
      requestedAmount: 150,
      creditCustomer: { name: "Klant A" },
      invoiceCustomer: { name: "Klant A" },
    })).toContain("factuur");
  });

  it("filtert enkel openstaande klanttegoeden", () => {
    const list = unallocatedCustomerCredits([
      { id: "1", number: "CN1", kind: "creditnota", total: -200, paid_amount: -200, credit_for: "f1", issue_date: "2026-11-01", customer: { name: "A" } },
      { id: "2", number: "CN2", kind: "creditnota", total: -200, paid_amount: -80, credit_for: "f2", issue_date: "2026-11-02", customer: { name: "B" } },
      { id: "3", number: "F1", kind: "factuur", total: 200, paid_amount: 0, credit_for: null, issue_date: "2026-11-02", customer: { name: "B" } },
    ]);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe("2");
    expect(list[0]?.openCredit).toBe(120);
  });
});