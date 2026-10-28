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

it("automatically assigns exactly 0% for an NL-prefixed customer VAT number (verlegd)", () => {
  expect(vatRateForCustomer("NL123456789B01", 21)).toBe(0);
  expect(vatRateForCustomer(" nl123456789b01 ", 12)).toBe(0);
});

it("keeps BE-prefixed customers at 0%", () => {
  expect(vatRateForCustomer("BE 0123.456.789", 21)).toBe(0);
  expect(vatRateForCustomer(" be0123456789 ", 6)).toBe(0);
});

it("always assigns 21% to a Dutch private customer recognised by NL postcode format", () => {
  expect(vatRateForCustomer(null, 6, undefined, { postalCode: "6211 AB" })).toBe(21);
  expect(vatRateForCustomer(null, 21, undefined, { postalCode: "1015 CJ" })).toBe(21);
  expect(vatRateForCustomer(" ", 12, undefined, { postalCode: "1234AB" })).toBe(21);
});

it("does not treat Belgian postcodes as Dutch", () => {
  expect(vatRateForCustomer(null, 12, undefined, { postalCode: "3740" })).toBe(12);
  expect(vatRateForCustomer(null, 6, undefined, { postalCode: "6211" })).toBe(6);
  expect(vatRateForCustomer(null, 12, undefined, { postalCode: "3740 Bilzen" })).toBe(12);
});

it("preserves the selected rate when there is no BE or NL prefix", () => {
  expect(vatRateForCustomer(null, 21)).toBe(21);
  expect(vatRateForCustomer("", 6)).toBe(6);
});

it("assigns 6% only to a private customer whose home is older than 10 years", () => {
  expect(vatRateForCustomer(null, 21, { customerType: "private", olderThanTenYears: true })).toBe(6);
});

it("never applies the private-home reduction to business or unknown customers", () => {
  expect(vatRateForCustomer(null, 21, { customerType: "business", olderThanTenYears: true })).toBe(21);
  expect(vatRateForCustomer(null, 21, { customerType: "unknown", olderThanTenYears: true })).toBe(21);
});

it("requires confirmed age over 10 years, not a newer home or missing age", () => {
  expect(vatRateForCustomer(null, 21, { customerType: "private", olderThanTenYears: false })).toBe(21);
  expect(vatRateForCustomer(null, 21, { customerType: "private", olderThanTenYears: null })).toBe(21);
});

it("keeps the BE number rule at 0% even when old private-home criteria are present", () => {
  expect(vatRateForCustomer("BE 0123.456.789", 21, { customerType: "private", olderThanTenYears: true })).toBe(0);
});