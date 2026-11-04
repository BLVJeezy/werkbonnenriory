import { expect, it } from "vitest";
import { branchesByProximity } from "./branches";
import { vatRateForCustomer } from "./vat-number";

const genk = { id: "g", name: "Genk", lat: 50.965, lon: 5.5, active: true };
const maastricht = { id: "m", name: "Maastricht", lat: 50.851, lon: 5.691, active: true, dutch_billing: true };
const uit = { id: "u", name: "Uit", lat: 50.85, lon: 5.69, active: false };

it("kiest de dichtstbijzijnde actieve vestiging", () => {
  expect(branchesByProximity([genk, maastricht, uit], [5.68, 50.84])[0]?.id).toBe("m");
  expect(branchesByProximity([genk, maastricht], [5.49, 50.96])[0]?.id).toBe("g");
});

it("vestiging met Nederlandse facturatie: geen 6%-woningregel, particulier 21%", () => {
  expect(vatRateForCustomer(null, 21, { customerType: "private", olderThanTenYears: true }, { dutchBranch: true })).toBe(21);
  expect(vatRateForCustomer(null, 21, undefined, { dutchBranch: true, defaultRate: 6 })).toBe(21);
});

it("vestiging met Nederlandse facturatie: bedrijf met btw-nummer blijft verlegd", () => {
  expect(vatRateForCustomer("NL123456789B01", 21, undefined, { dutchBranch: true })).toBe(0);
});
