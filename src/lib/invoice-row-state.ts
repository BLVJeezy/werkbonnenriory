/** Kleurstatus van een rij in de facturenlijst: groen = betaald, wit = open, rood = vervallen. */
export type RowState = "paid" | "open" | "overdue";

/**
 * Een factuur is betaald zodra het saldo weg is. Een open factuur is vervallen
 * wanneer de vervaldag yesterday of eerder is; op de vervaldag zelf nog niet.
 * Creditnota's worden verrekend met een factuur en krijgen daarom geen eigen kleur.
 */
export function invoiceRowState(
  i: { kind: string; total: number; paid_amount: number; due_date: string },
  today: string,
): RowState {
  if (i.kind === "creditnota") return "open";
  if (Number(i.total) - Number(i.paid_amount) <= 0.005) return "paid";
  return i.due_date < today ? "overdue" : "open";
}

/** Een afgewerkte werkbon is betaald zodra er een betaling is genoteerd; een vervaldag bestaat er nog niet. */
export function workOrderRowState(w: { paid_at: string | null }): RowState {
  return w.paid_at ? "paid" : "open";
}
