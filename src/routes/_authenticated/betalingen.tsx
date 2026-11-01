import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { euro } from "@/lib/billing";
import { SortTh, Th, tableCls, tableWrap, useSort } from "@/components/SortTable";
import { useState } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BankInvoiceLink, type BankTransaction } from "@/components/BankInvoiceLink";

export const Route = createFileRoute("/_authenticated/betalingen")({
  head: () => ({ meta: [{ title: "Bankverrichtingen — Riory Werkbonnen" }, { name: "description", content: "Alle Ponto-bankverrichtingen, automatisch ververst." }, { property: "og:title", content: "Bankverrichtingen — Riory Werkbonnen" }, { property: "og:description", content: "Alle Ponto-bankverrichtingen, automatisch ververst." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  beforeLoad: () => { throw redirect({ to: "/boekhouding", search: { tab: "bank" }, replace: true }); },
});

function Betalingen() {
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["ponto_transactions"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const [t, r] = await Promise.all([
        supabase.from("ponto_transactions").select("*").order("execution_date", { ascending: false }).order("synced_at", { ascending: false }).limit(500),
        supabase.from("ponto_reconciliations").select("transaction_key, invoice_id, purchase_invoice_id, invoices(number), purchase_invoices(invoice_number)"),
      ]);
      if (t.error) throw t.error;
      if (r.error) throw r.error;
      const matched = new Map((r.data ?? []).map((x) => [x.transaction_key, (x.invoices as { number?: string } | null)?.number ?? (x.purchase_invoices as { invoice_number?: string } | null)?.invoice_number ?? "afgepunt"]));
      return { txs: t.data ?? [], matched };
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-3xl font-black uppercase">Bankverrichtingen</h1>
        {dataUpdatedAt > 0 && <span className="text-xs text-muted-foreground">Ververst automatisch · laatst {new Date(dataUpdatedAt).toLocaleTimeString("nl-BE")}</span>}
      </div>
      <p className="text-sm text-muted-foreground">Alle verrichtingen die Ponto binnenhaalt bij de automatische controle (elk uur). Afgepunte betalingen tonen het factuurnummer.</p>
      {isLoading && <p className="text-muted-foreground">Laden…</p>}
      {!isLoading && !data?.txs.length && <p className="text-muted-foreground">Nog geen verrichtingen opgehaald. Ze verschijnen hier na de eerstvolgende Ponto-controle.</p>}
      {!!data?.txs.length && <BankTable txs={data.txs} matched={data.matched} />}
    </div>
  );
}

type Tx = BankTransaction;
function BankTable({ txs, matched }: { txs: Tx[]; matched: Map<string, string> }) {
  const [selected, setSelected] = useState<Tx | null>(null);
  const sort = useSort(txs, { datum: (t) => t.execution_date, naam: (t) => t.counterpart_name, bedrag: (t) => Number(t.amount), status: (t) => matched.get(t.transaction_key) ?? null }, "datum", "desc");
  return (
    <><div className={tableWrap}>
      <table className={tableCls}>
        <thead><tr>
          <SortTh k="datum" sort={sort}>Datum</SortTh>
          <SortTh k="naam" sort={sort}>Tegenpartij</SortTh>
          <Th className="hidden md:table-cell">Mededeling</Th>
          <SortTh k="bedrag" sort={sort} right>Bedrag</SortTh>
          <SortTh k="status" sort={sort}>Afgepunt</SortTh>
        </tr></thead>
        <tbody>
          {sort.sorted.map((t) => {
            const match = matched.get(t.transaction_key);
            const inkomend = Number(t.amount) > 0;
            return (
              <tr key={t.transaction_key}>
                <td className="whitespace-nowrap text-muted-foreground">{t.execution_date ? new Date(`${t.execution_date}T00:00`).toLocaleDateString("nl-BE") : "—"}</td>
                <td className="font-bold">{t.counterpart_name ?? "Onbekend"}<div className="max-w-xs truncate text-xs font-normal text-muted-foreground md:hidden">{t.remittance}</div></td>
                <td className="hidden max-w-sm truncate text-xs text-muted-foreground md:table-cell" title={t.remittance ?? ""}>{t.remittance}</td>
                <td className={`whitespace-nowrap text-right font-mono font-bold ${inkomend ? "text-accent-foreground" : "text-destructive"}`}>{inkomend ? "+" : ""}{euro(Number(t.amount))}</td>
                <td>{match ? <span className="whitespace-nowrap rounded bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">{match}</span> : inkomend ? <Button variant="outline" size="sm" onClick={() => setSelected(t)}><Link2 className="size-4" />Koppelen</Button> : <span className="text-xs text-muted-foreground">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>{selected && <BankInvoiceLink key={selected.transaction_key} transaction={selected} onClose={() => setSelected(null)} />}</>
  );
}
