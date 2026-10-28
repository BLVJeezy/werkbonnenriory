import { describe, it, expect } from "vitest";
import { isUrgentMail } from "./urgent-mail";

describe("isUrgentMail", () => {
  it("URGENT in onderwerp", () => expect(isUrgentMail("URGENT: lek", "")).toBe(true));
  it("vaste zin in mail", () => expect(isUrgentMail("Afspraak", "Hoge urgentie, indien mogelijk vandaag geholpen*.\nNaam: X")).toBe(true));
  it("andere dringende woorden tellen niet", () => expect(isUrgentMail("Spoed lek", "dringend, wateroverlast")).toBe(false));
  it("urgentie laag telt niet", () => expect(isUrgentMail("Afspraak", "Lage urgentie")).toBe(false));
});
