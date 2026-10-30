import { describe, expect, it } from "vitest";
import { buildSepaQr, openAmount, paymentText } from "./sepa-qr";
import { matchInvoice } from "./ponto-match";

const base = { serviceName: "Riory bv", iban: "BE71 0961 2345 6769", bic: "GEBABEBB", amount: 358.34, reference: "2026-0817" };

describe("buildSepaQr", () => {
  it("writes the EPC069-08 v2 payload with correct bank field order", () => {
    const lines = buildSepaQr(base).split("\n");
    expect(lines).toHaveLength(12);
    expect(lines.slice(0, 4)).toEqual(["BCD", "002", "1", "SCT"]);
    expect(lines[4]).toBe("GEBABEBB");
    expect(lines[5]).toBe("Riory bv");
    expect(lines[6]).toBe("BE71096123456769");
    expect(lines[7]).toBe("EUR358.34");
    expect(lines[9]).toBe('');
    expect(lines[10]).toBe("+++002/0260/81739+++");
  });

  it("keeps the invoice number in the communication so Ponto still matches the payment", () => {
    const payload = buildSepaQr(base);
    const communication = payload.split("\n")[10] ?? "";
    const invoice = { id: "1", number: "2026-0817", total: 358.34, paidAmount: 0 };
    const tx = { amount: 358.34, remittanceInformation: communication, executionDate: "2026-11-10", counterpartName: "J. Doe" };
    expect(matchInvoice(tx, [invoice])?.id).toBe("1");
  });

  it("rejects an IBAN that is not a plausible account number", () => {
    expect(() => buildSepaQr({ ...base, iban: "BE12" })).toThrow("Ongeldig IBAN");
  });

  it("rejects a zero or negative amount", () => {
    expect(() => buildSepaQr({ ...base, amount: 0 })).toThrow("Bedrag");
    expect(() => buildSepaQr({ ...base, amount: -5 })).toThrow("Bedrag");
  });

  it("leaves the BIC line empty when no BIC is stored", () => {
    expect(buildSepaQr({ ...base, bic: null }).split("\n")[4]).toBe("");
  });

  it("clips a very long business name to 70 characters", () => {
    expect(buildSepaQr({ ...base, serviceName: "x".repeat(120) }).split("\n")[5]).toHaveLength(70);
  });
});

describe("openAmount", () => {
  it("subtracts what is already paid, to the cent", () => {
    expect(openAmount(121, 20.5)).toBe(100.5);
    expect(openAmount(100, 99.999)).toBe(0);
  });
});

describe("paymentText", () => {
  it("shows grouped IBAN, amount and the invoice communication", () => {
    const text = paymentText(base);
    expect(text).toContain("Te betalen: EUR 358.34");
    expect(text).toContain("IBAN: BE71 0961 2345 6769");
    expect(text).toContain("Mededeling: +++002/0260/81739+++");
    expect(text).toContain("BIC: GEBABEBB");
  });
});
