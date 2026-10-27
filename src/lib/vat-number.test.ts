import { expect, it } from "vitest";
import { customerVatNumber, vatRateForCustomer } from "./vat-number";

it("keeps the customer VAT number extracted from mail", () => {
  expect(customerVatNumber(" BE 0123.456.789 ")).toBe("BE 0123.456.789");
});
it("does not invent a VAT number when absent", () => {
  expect(customerVatNumber(null)).toBeNull();
  expect(customerVatNumber(" ")).toBeNull();
});

it("automatically assigns exactly 0% for a BE-prefixed customer VAT number", () => {
  expect(vatRateForCustomer("BE 0123.456.789", 21)).toBe(0);
  expect(vatRateForCustomer(" be0123456789 ", 6)).toBe(0);
});

it("preserves the selected rate when there is no BE prefix", () => {
  expect(vatRateForCustomer("NL123456789B01", 12)).toBe(12);
  expect(vatRateForCustomer(null, 21)).toBe(21);
  expect(vatRateForCustomer("", 6)).toBe(6);
});