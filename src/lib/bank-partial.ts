// Deelbetalingen: een bankbetaling die kleiner is dan het openstaande factuurbedrag
// mag toch afgeletterd worden; de factuur blijft open voor het restant.
// Kandidaten worden enkel voorgesteld als de naam of het factuurnummer overeenkomt,
// zodat een gelijk bedrag alleen nooit tot een verkeerde koppeling leidt.

import { docExpectsOutgoing } from "./bank-split";

export const normParty = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9 ]/g, "");

export function partyMatches(txText: string, party: string, number: string | null | undefined): boolean {
  const hay = normParty(txText);
  const nr = String(number ?? "").replace(/\D/g, "");
  if (nr.length >= 4 && hay.replace(/\s/g, "").includes(nr)) return true;
  return normParty(party).split(/\s+/).some((w) => w.length >= 4 && hay.includes(w));
}

export function partialInvoiceCandidates<T extends { direction: string; doc_type?: string | null; counterparty?: string | null; number?: string | null }>(
  tx: { amount: number; counterparty?: string | null; description?: string | null },
  open: T[],
  remaining: (i: T) => number,
  effAmt: number,
): T[] {
  return open.filter((i) =>
    (tx.amount < 0) === docExpectsOutgoing(i) &&
    Math.abs(remaining(i)) > effAmt + 0.025 &&
    partyMatches(`${tx.counterparty ?? ""} ${tx.description ?? ""}`, i.counterparty ?? "", i.number),
  );
}
