import { describe, it, expect } from "vitest";
import { productRevenue } from "./product-revenue";

describe("productRevenue", () => {
  const r = productRevenue([
    { name: "Camera-inspectie 32-50", quantity: 1, amount: 100 },
    { name: "Camera-inspectie 125-250", quantity: 2, amount: 300 },
    { name: "Ledigen Septische put. tot 2000l", quantity: 1, amount: 225 },
    { name: "Ledigen septische put extra m³", quantity: 2, amount: 80 },
    { name: "Volledige dieptereiniging regenwaterput 10.000l", quantity: 1, amount: 369.45 },
    { name: "Volledige dieptereiniging regenwaterput tot 5000l", quantity: 1, amount: 329.45 },
    { name: "Waterdichting regenwaterput 10000L", quantity: 1, amount: 1345 },
    { name: "Riostop", quantity: 3, amount: 105 },
  ]);
  const get = (k: string) => r.find((x) => x.key === k)!;
  it("houdt de camera-inspecties apart", () => {
    expect(get("cam32").amount).toBe(100);
    expect(get("cam75").amount).toBe(0);
    expect(get("cam125").quantity).toBe(2);
  });
  it("vat septische putten samen", () => expect(get("septisch").amount).toBe(305));
  it("vat regenputreinigingen samen zonder waterdichting", () => expect(get("regenput").amount).toBe(698.9));
  it("telt riostoppen", () => expect(get("riostop").quantity).toBe(3));
});
