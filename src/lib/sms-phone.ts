/** Normalizes Belgian/Dutch phone input to E.164 and checks it is a mobile number (SMS only reaches mobiles). */
export type PhoneResult = { ok: true; e164: string } | { ok: false; error: string };

export function normalizeMobile(input: string): PhoneResult {
  let s = (input ?? "").replace(/[\s.\-/()]/g, "");
  if (!s) return { ok: false, error: "Geen telefoonnummer ingevuld" };
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) {
    // already international; drop a trunk 0 written after the country code, e.g. +32 (0)470…
    s = s.replace(/^\+(32|31)0/, "+$1");
  } else if (/^04\d{8}$/.test(s)) s = "+32" + s.slice(1);
  else if (/^06\d{8}$/.test(s)) s = "+31" + s.slice(1);
  else if (/^(32|31)\d+$/.test(s)) s = "+" + s;
  else return { ok: false, error: "Onbekend formaat — gebruik bv. 0470 12 34 56 of +31 6 12345678" };
  if (!/^\+\d+$/.test(s)) return { ok: false, error: "Nummer bevat ongeldige tekens" };
  if (/^\+324[5-9]\d{7}$/.test(s) || /^\+316\d{8}$/.test(s)) return { ok: true, e164: s };
  if (s.startsWith("+32") || s.startsWith("+31")) return { ok: false, error: "Dit is geen gsm-nummer (SMS kan alleen naar een mobiel nummer)" };
  return { ok: false, error: "Alleen Belgische en Nederlandse gsm-nummers worden ondersteund" };
}

export function onderwegTemplate(name?: string | null): string {
  const n = (name ?? "").trim();
  return `Riory BV: ${n ? `Beste ${n}, o` : "O"}nze technieker is onderweg naar uw adres. Met vriendelijke groeten, Riory BV`;
}

export function maskPhone(e164: string): string {
  return e164.length > 6 ? e164.slice(0, 4) + " •••• " + e164.slice(-2) : "••••";
}
