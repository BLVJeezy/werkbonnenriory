import { describe, expect, it } from "vitest";
import { parseCoda } from "./coda";

const pad = (s: string, n: number) => s.padEnd(n, " ");

// Bouw een CODA-record 21 met vaste posities.
const rec21 = (opts: { sign: "0" | "1"; cents: number; booking: string; ref?: string }) => {
  const l = Array(128).fill(" ");
  const put = (pos: number, s: string) => { for (let i = 0; i < s.length; i++) l[pos + i] = s[i]; };
  put(0, "21");
  put(10, pad(opts.ref ?? "REF123", 21));
  put(31, opts.sign + String(opts.cents).padStart(14, "0"));
  put(46, opts.booking); // valutadatum
  put(115, opts.booking); // boekingsdatum
  return l.join("");
};

const rec23 = (name: string, account = "") => {
  const l = Array(128).fill(" ");
  const put = (pos: number, s: string) => { for (let i = 0; i < s.length; i++) l[pos + i] = s[i]; };
  put(0, "23");
  put(10, pad(account, 35));
  put(47, pad(name, 35));
  return l.join("");
};

const rec31 = (text: string) => {
  const l = Array(128).fill(" ");
  const put = (pos: number, s: string) => { for (let i = 0; i < s.length; i++) l[pos + i] = s[i]; };
  put(0, "31");
  put(40, pad(text, 75));
  return l.join("");
};

describe("parseCoda", () => {
  it("leest een bijschrijving met tegenpartij en mededeling", () => {
    const coda = [
      rec21({ sign: "0", cents: 21914, booking: "151026", ref: "BNK/001" }),
      rec23("DECKMYN HENDRIK", "BE12 3456 7890 1234"),
      rec31("FACTUUR 20260801"),
    ].join("\n");
    expect(parseCoda(coda)).toEqual([
      { tx_date: "2026-10-15", amount: 219.14, counterparty: "DECKMYN HENDRIK", description: "FACTUUR 20260801", reference: "BNK/001" },
    ]);
  });

  it("leest een afboeking als negatief bedrag", () => {
    const coda = rec21({ sign: "1", cents: 5000, booking: "011126" });
    expect(parseCoda(coda)[0]).toMatchObject({ tx_date: "2026-11-01", amount: -50 });
  });

  it("gebruikt de valutadatum als de boekingsdatum ontbreekt", () => {
    const l = rec21({ sign: "0", cents: 100, booking: "200926" });
    const noBooking = l.slice(0, 115) + "      " + l.slice(121);
    expect(parseCoda(noBooking)[0]?.tx_date).toBe("2026-09-20");
  });

  it("negeert saldo- en koprecords en kapotte bewegingen", () => {
    const coda = ["0000000000", "12" + " ".repeat(126), "21" + "x".repeat(126), "8" + " ".repeat(127), "9" + " ".repeat(127)].join("\n");
    expect(parseCoda(coda)).toEqual([]);
  });

  it("combineert meerdere informatieregels in één mededeling", () => {
    const coda = [rec21({ sign: "0", cents: 7500, booking: "101026" }), rec31("OVERSCHRIJVING"), rec31("DEEL 2")].join("\n");
    expect(parseCoda(coda)[0]?.description).toBe("OVERSCHRIJVING DEEL 2");
  });
});
