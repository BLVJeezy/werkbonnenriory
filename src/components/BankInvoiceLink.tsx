import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SearchSelect } from "@/components/SearchSelect";
import { bankLinkInvoices, linkBankTransaction } from "@/lib/ponto.functions";
import { bankLinkBalance, bankLinkError } from "@/lib/bank-link";
import { euro } from "@/lib/billing";

export type BankTransaction = { transaction_key: string; execution_date: string | null; counterpart_name: string | null; amount: number | string; remittance: string | null };

export function BankInvoiceLink({ transaction, onClose }: { transaction: BankTransaction; onClose: () => void }) {
  const [invoiceId, setInvoiceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const loadInvoices = useServerFn(bankLinkInvoices);
  const link = useServerFn(linkBankTransaction);
  const qc = useQueryClient();
  const { data: invoices = [], isPending, error } = useQuery({ queryKey: ["bank-link-invoices"], queryFn: () => loadInvoices(), staleTime: 0 });
  const amount = Number(transaction.amount);
  const selected = invoices.find(invoice => invoice.id === invoiceId);
  const validation = selected ? bankLinkError(amount, selected) : null;
  const options = [...invoices].sort((a, b) => Number(bankLinkBalance(b) === amount) - Number(bankLinkBalance(a) === amount)).map(invoice => ({ value: invoice.id, label: `${invoice.number} · ${invoice.customerName} · open ${euro(bankLinkBalance(invoice))}` }));

  async function save() {
    if (!selected || busy || validation) return;
    setBusy(true);
    setSaveError(null);
    try {
      await link({ data: { transactionKey: transaction.transaction_key, invoiceId: selected.id } });
      await Promise.all(["ponto_transactions", "facturen", "bank-link-invoices", "dashboard-omzet", "payment-reminder-escalations"].map(key => qc.invalidateQueries({ queryKey: [key] })));
      toast.success(`Betaling gekoppeld aan factuur ${selected.number}`);
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Koppelen mislukt");
    } finally {
      setBusy(false);
    }
  }

  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto">
      <DialogHeader><DialogTitle>Verrichting koppelen</DialogTitle><DialogDescription>Betaling aan een verkoopfactuur</DialogDescription></DialogHeader>
      <div className="space-y-1 border-b pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-bold">{transaction.counterpart_name ?? "Onbekend"}</span><span className="font-mono text-lg font-bold">{euro(amount)}</span></div>
        <p className="text-xs text-muted-foreground">{transaction.execution_date ? new Date(`${transaction.execution_date}T00:00`).toLocaleDateString("nl-BE") : "Geen datum"}</p>
        {transaction.remittance && <p className="break-words text-sm text-muted-foreground">{transaction.remittance}</p>}
      </div>
      {isPending ? <p className="text-sm text-muted-foreground">Facturen laden…</p> : error ? <p role="alert" className="text-sm text-destructive">Facturen konden niet geladen worden.</p> : !invoices.length ? <p className="text-sm text-muted-foreground">Geen openstaande facturen.</p> : <div className="space-y-2"><label htmlFor="bank-invoice" className="text-sm font-bold">Factuur</label><SearchSelect modal id="bank-invoice" options={options} value={invoiceId} onChange={value => { setInvoiceId(value); setSaveError(null); }} placeholder="Factuur kiezen…" searchPlaceholder="Zoek op factuurnummer of klant…" /></div>}
      {selected && <dl className="grid grid-cols-2 gap-2 text-sm"><dt className="text-muted-foreground">Openstaand</dt><dd className="text-right font-mono">{euro(bankLinkBalance(selected))}</dd><dt className="text-muted-foreground">Deze betaling</dt><dd className="text-right font-mono">{euro(amount)}</dd><dt className="font-bold">Resterend na koppeling</dt><dd className="text-right font-mono font-bold">{euro(Math.max(0, bankLinkBalance(selected) - amount))}</dd></dl>}
      {(validation || saveError) && <p role="alert" className="text-sm text-destructive">{saveError ?? validation}</p>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={onClose}>Annuleren</Button><Button className="h-auto min-h-10 whitespace-normal" disabled={busy || !selected || !!validation} onClick={save}><Link2 className="size-4 shrink-0" />{busy ? "Koppelen…" : "Koppelen en betaling registreren"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}