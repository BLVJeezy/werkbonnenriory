import { describe, expect, it } from "vitest";
import { matchSimplaCustomer } from "./simpla";
describe("Simpla klantkoppeling", () => {
  it("koppelt op e-mail met voorrang boven naam", () => {
    expect(matchSimplaCustomer([{ customerId: 1, customerName: "Riory" }, { customerId: 2, customerEmail: " INFO@RIORY.BE " }], "Riory", "info@riory.be")?.customerId).toBe(2);
  });
  it("koppelt een unieke naam zonder e-mail", () => {
    expect(matchSimplaCustomer([{ customerId: 3, customerName: "Klant" }], " klant ", null)?.customerId).toBe(3);
  });
  it("weigert dubbele of geblokkeerde klanten", () => {
    expect(matchSimplaCustomer([{ customerName: "Klant" }, { customerName: "Klant" }], "Klant", null)).toBeNull();
    expect(matchSimplaCustomer([{ customerName: "Klant", isBlocked: true }], "Klant", null)).toBeNull();
  });
});