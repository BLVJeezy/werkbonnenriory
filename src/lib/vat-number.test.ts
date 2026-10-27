import { expect, it } from "vitest";
import { customerVatNumber } from "./vat-number";

it("keeps the customer VAT number extracted from mail", () => {
  expect(customerVatNumber(" BE 0123.456.789 ")).toBe("BE 0123.456.789");
});
it("does not invent a VAT number when absent", () => {
  expect(customerVatNumber(null)).toBeNull();
  expect(customerVatNumber(" ")).toBeNull();
});