import { describe, expect, it } from "vitest";
import { selectedContractBenefits } from "./contract-types";

describe("expliciete contractvoordelen", () => {
  it("selecteert geen voordelen wanneer de admin niets heeft aangevinkt", () => {
    expect(selectedContractBenefits(undefined)).toEqual([]);
    expect(selectedContractBenefits([])).toEqual([]);
  });

  it("behoudt uitsluitend gekozen voordelen zonder dubbelingen of onbekende opties", () => {
    const values = selectedContractBenefits(["meal_vouchers", "phone", "phone", "unknown"])
      .map((benefit) => benefit.value);
    expect(values).toEqual(["meal_vouchers", "phone"]);
  });
});