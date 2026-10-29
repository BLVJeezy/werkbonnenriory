import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { euro } from "@/lib/billing";

export const Route = createFileRoute("/_authenticated/betalingen")({
  head: () => ({ meta: [{ title: "Bankverrichtingen — Riory Werkbonnen" }, { name: "description", content: "Alle Ponto-bankverrichtingen, automatisch ververst." }, { property: "og:title", content: "Bankverrichtingen — Riory Werkbonnen" }, { property: "og:description", content: "Alle Ponto-bankverrichtingen, automatisch ververst." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Betalingen,
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
      <ul className="divide-y rounded-md border bg-card">
        {data?.txs.map((t) => {
          const match = data.matched.get(t.transaction_key);
          const inkomend = Number(t.amount) > 0;
          return (
            <li key={t.transaction_key} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
              <span className="text-sm text-muted-foreground">{t.execution_date ? new Date(`${t.execution_date}T00:00`).toLocaleDateString("nl-BE") : "—"}</span>
              <span className="font-bold">{t.counterpart_name ?? "Onbekend"}</span>
              <span className={`font-mono font-bold ${inkomend ? "text-accent-foreground" : "text-destructive"}`}>{inkomend ? "+" : ""}{euro(Number(t.amount))}</span>
              {match && <span className="rounded bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">Afgepunt · {match}</span>}
              {t.remittance && <span className="w-full text-xs text-muted-foreground [overflow-wrap:anywhere]">{t.remittance}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
