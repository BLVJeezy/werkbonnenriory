import { describe, expect, it } from "vitest";
import { bankLinkBalance, bankLinkError, type BankInvoice } from "./bank-link";

const invoice: BankInvoice = { id: "invoice", number: "20260001", customerName: "Klant", total: 121, paidAmount: 21, kind: "factuur" };

describe("bankverrichting koppelen", () => {
  it("laat een betaling van het volledige resterende saldo toe", () => {
    expect(bankLinkBalance(invoice)).toBe(100);
    expect(bankLinkError(100, invoice)).toBeNull();
  });
  it("laat een gedeeltelijke betaling toe", () => {
    expect(bankLinkError(40, invoice)).toBeNull();
  });
  it("weigert een uitgaande betaling", () => {
    expect(bankLinkError(-100, invoice)).not.toBeNull();
  });
  it("weigert een bedrag boven het resterende saldo", () => {
    expect(bankLinkError(100.01, invoice)).not.toBeNull();
  });
  it("weigert een creditnota", () => {
    expect(bankLinkError(100, { ...invoice, kind: "creditnota" })).not.toBeNull();
  });
  it("weigert een volledig betaalde factuur", () => {
    expect(bankLinkError(1, { ...invoice, paidAmount: 121 })).not.toBeNull();
  });
  it("weigert dezelfde verrichting een tweede keer", () => {
    expect(bankLinkError(100, invoice, true)).not.toBeNull();
  });
});