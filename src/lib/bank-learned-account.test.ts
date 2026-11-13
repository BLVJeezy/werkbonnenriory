import { describe, expect, it } from "vitest";
import { learnedAccount } from "./bank-learned-account";
const h = (accounts: string[], amount = -50, iban = "BE68539007547034") => ({ counterparty: "Proximus", counterparty_account: iban, amount, accounts });
describe("learnedAccount", () => {
  it("boekt op de rekening van twee gelijke eerdere boekingen", () => expect(learnedAccount([h(["613550"]), h(["613550"])], { counterparty_account: "BE68539007547034", amount: -40 })).toBe("613550"));
  it("niet bij maar één eerdere boeking", () => expect(learnedAccount([h(["613550"])], { counterparty_account: "BE68539007547034", amount: -40 })).toBeNull());
  it("niet bij wisselende rekeningen", () => expect(learnedAccount([h(["613550"]), h(["618001"])], { counterparty_account: "BE68539007547034", amount: -40 })).toBeNull());
  it("niet op klant- of leveranciersrekening", () => expect(learnedAccount([h(["440110"]), h(["440110"])], { counterparty_account: "BE68539007547034", amount: -40 })).toBeNull());
  it("niet bij gesplitste leningboekingen", () => expect(learnedAccount([h(["423220", "650010"]), h(["423220", "650010"])], { counterparty_account: "BE68539007547034", amount: -116 })).toBeNull());
  it("niet bij omgekeerd teken", () => expect(learnedAccount([h(["613550"]), h(["613550"])], { counterparty_account: "BE68539007547034", amount: 40 })).toBeNull());
});
