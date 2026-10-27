const digits = (p: string | null | undefined) => (p ?? "").replace(/[^\d+]/g, "").replace(/^\+32/, "0").replace(/^0032/, "0");

/** Belknoppen: contactpersoon alleen als het een ander nummer is dan de klant. */
export function callTargets(customerPhone: string | null | undefined, contactPhone: string | null | undefined) {
  const c = digits(customerPhone);
  const s = digits(contactPhone);
  return { customer: c || null, contact: s && s !== c ? s : null };
}
