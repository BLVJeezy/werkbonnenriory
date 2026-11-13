/** Leert per tegenpartij (IBAN, anders naam) op welke rekening eerdere bankverrichtingen handmatig geboekt werden. */
export type BankHistory = { counterparty: string | null; counterparty_account: string | null; amount: number; accounts: string[] };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
export const partyKey = (t: { counterparty?: string | null; counterparty_account?: string | null }) => {
  const iban = (t.counterparty_account ?? "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (iban.length >= 12) return `iban:${iban}`;
  const name = norm(t.counterparty ?? "");
  return name.length >= 4 ? `naam:${name}` : null;
};

/** Klant/leverancier (40/44), wachtrekening en bank zijn nooit een vaste-kostenregel: die horen bij facturen of controle. */
const excluded = (a: string) => /^(40|44|55|499)/.test(a);

/** Eén rekening alleen als de laatste minstens twee boekingen van die partij, met hetzelfde teken, allemaal op precies die rekening gingen. */
export function learnedAccount(history: BankHistory[], tx: { counterparty?: string | null; counterparty_account?: string | null; amount: number }): string | null {
  const key = partyKey(tx);
  if (!key) return null;
  const same = history.filter((h) => partyKey(h) === key && Math.sign(h.amount) === Math.sign(tx.amount));
  if (same.length < 2) return null;
  const recent = same.slice(0, 5);
  const first = recent[0].accounts;
  if (first.length !== 1 || excluded(first[0])) return null;
  return recent.every((h) => h.accounts.length === 1 && h.accounts[0] === first[0]) ? first[0] : null;
}
