export type BankInvoice = {
  id: string;
  number: string;
  customerName: string;
  total: number;
  paidAmount: number;
  kind: string;
};

export function bankLinkBalance(invoice: BankInvoice) {
  return Math.round((invoice.total - invoice.paidAmount) * 100) / 100;
}

export function bankLinkError(amount: number, invoice: BankInvoice, alreadyLinked = false): string | null {
  if (alreadyLinked) return "Deze verrichting is al gekoppeld";
  if (!Number.isFinite(amount) || amount <= 0) return "Kies een inkomende betaling voor een verkoopfactuur";
  if (invoice.kind !== "factuur") return "Kies een verkoopfactuur, geen creditnota";
  const balance = bankLinkBalance(invoice);
  if (balance <= 0) return "Deze factuur is al volledig betaald";
  if (Math.round(amount * 100) > Math.round(balance * 100)) return "Het bedrag is hoger dan het openstaande saldo";
  return null;
}