import { describe, expect, it } from "vitest";
import {
  matchWachtrekeningLines,
  type BankTxCandidate,
  type PurchaseDocCandidate,
  type SalesDocCandidate,
  type WachtrekeningLine,
} from "./wachtrekening-match";

describe("matchWachtrekeningLines", () => {
  const bankTxs: BankTxCandidate[] = [
    {
      id: "tx-1",
      tx_date: "2026-10-14",
      amount: -245.5,
      counterparty: "Deschacht Plastics NV",
      counterparty_account: "BE68539007547034",
      description: "Factuur 2026-88412",
      matched_invoice_id: null,
      matched_purchase_invoice_id: null,
      entry_id: null,
    },
    {
      id: "tx-2",
      tx_date: "2026-10-20",
      amount: 314.6,
      counterparty: "KOZL vzw",
      counterparty_account: "BE12000011112222",
      description: "+++202/6093/50012+++",
      matched_invoice_id: "inv-1",
      matched_purchase_invoice_id: null,
      entry_id: "ent-1",
    },
    {
      id: "tx-3",
      tx_date: "2026-10-22",
      amount: -89.0,
      counterparty: "TotalEnergies Tankstation",
      counterparty_account: "BE99000099998888",
      description: "Bancontact tankbeurt",
      matched_invoice_id: null,
      matched_purchase_invoice_id: null,
      entry_id: null,
    },
  ];

  const purchases: PurchaseDocCandidate[] = [
    {
      id: "pur-1",
      invoice_number: "2026-88412",
      supplier_name: "Deschacht Plastics NV",
      invoice_date: "2026-10-05",
      total: 245.5,
      status: "approved",
      payment_ref: "2026-88412",
      kind: "invoice",
    },
  ];

  const sales: SalesDocCandidate[] = [
    {
      id: "inv-1",
      number: "20260935",
      customer_name: "KOZL vzw",
      issue_date: "2026-10-10",
      total: 314.6,
      paid_amount: 314.6,
      status: "paid",
      kind: "invoice",
    },
  ];

  it("vindt zowel bankverrichting als aankoopfactuur op bedrag en leverancier", () => {
    const lines: WachtrekeningLine[] = [
      { id: "1", date: "2026-10-14", amount: -245.5, counterparty: "Deschacht", description: "Betaling 2026-88412", reference: "2026-88412" },
    ];
    const [res] = matchWachtrekeningLines(lines, bankTxs, purchases, sales);
    expect(res?.status).toBe("document_found");
    expect(res?.bankTx?.id).toBe("tx-1");
    expect(res?.document?.type).toBe("purchase");
    expect(res?.document?.id).toBe("pur-1");
  });

  it("neemt al gekoppelde verkoopfactuur over van de gevonden bankverrichting", () => {
    const lines: WachtrekeningLine[] = [
      { id: "2", date: "2026-10-20", amount: 314.6, counterparty: "KOZL", description: "Overschrijving", reference: "" },
    ];
    const [res] = matchWachtrekeningLines(lines, bankTxs, purchases, sales);
    expect(res?.status).toBe("document_found");
    expect(res?.bankTx?.id).toBe("tx-2");
    expect(res?.document?.type).toBe("sales");
    expect(res?.document?.id).toBe("inv-1");
  });

  it("meldt bank_only wanneer betaling gevonden is maar geen document in de app staat", () => {
    const lines: WachtrekeningLine[] = [
      { id: "3", date: "2026-10-22", amount: -89.0, counterparty: "TotalEnergies", description: "Tankbeurt", reference: "" },
    ];
    const [res] = matchWachtrekeningLines(lines, bankTxs, purchases, sales);
    expect(res?.status).toBe("bank_only");
    expect(res?.bankTx?.counterparty).toBe("TotalEnergies Tankstation");
    expect(res?.document).toBeNull();
  });

  it("meldt unmatched wanneer geen bankverrichting en geen document overeenkomt", () => {
    const lines: WachtrekeningLine[] = [
      { id: "4", date: "2026-09-01", amount: -999.99, counterparty: "Onbekend", description: "Geen match", reference: "" },
    ];
    const [res] = matchWachtrekeningLines(lines, bankTxs, purchases, sales);
    expect(res?.status).toBe("unmatched");
    expect(res?.bankTx).toBeNull();
    expect(res?.document).toBeNull();
  });
});