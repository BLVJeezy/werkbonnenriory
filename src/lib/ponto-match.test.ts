import { describe, expect, it } from "vitest";
import { matchInvoice, type OpenInvoice, type PontoTransaction } from "./ponto-match";

const open: OpenInvoice[] = [
  { id: "1", number: "20260816", total: 251.57, paidAmount: 0 },
  { id: "2", number: "20260817", total: 526.03, paidAmount: 0 },
];

const tx = (amount: number, remittanceInformation: string | null): PontoTransaction =>
  ({ amount, remittanceInformation, executionDate: "2026-10-27", counterpartName: "Klant" });

describe("matchInvoice", () => {
  it("matcht op bedrag en gestructureerde mededeling met factuurnummer", () => {
    expect(matchInvoice(tx(251.57, "+++202/6081/60000+++"), open)?.id).toBe("1");
  });

  it("matcht op vrije mededeling met het factuurnummer erin", () => {
    expect(matchInvoice(tx(526.03, "Betaling factuur 2026-0817"), open)?.id).toBe("2");
  });

  it("matcht niet bij een afwijkend bedrag", () => {
    expect(matchInvoice(tx(250, "+++202/6081/60000+++"), open)).toBeNull();
  });

  it("matcht niet zonder mededeling", () => {
    expect(matchInvoice(tx(251.57, null), open)).toBeNull();
  });

  it("matcht niet bij een negatief bedrag (uitgaande betaling)", () => {
    expect(matchInvoice(tx(-251.57, "20260816"), open)).toBeNull();
  });

  it("matcht niet op een reeds volledig betaalde factuur", () => {
    expect(matchInvoice(tx(251.57, "20260816"), [{ ...open[0]!, paidAmount: 251.57 }])).toBeNull();
  });

  it("matcht op het openstaande saldo bij deelbetaling", () => {
    expect(matchInvoice(tx(151.57, "20260816"), [{ ...open[0]!, paidAmount: 100 }])?.id).toBe("1");
  });
});
