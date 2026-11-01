import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const eur = (n: number) => n.toLocaleString("nl-BE", { style: "currency", currency: "EUR" });

/** Overzicht van kaartcommissies (bv. Europabank) op 653000, met export voor de boekhouder. */
export function CardFeeReport({ companyId }: { companyId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["fin", "card-fees", companyId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("fin_journal_lines")
        .select("debit, description, entry_id, fin_journal_entries!inner(entry_date, reference, description)")
        .eq("company_id", companyId).eq("account", "653000").like("description", "Commissie kaartbetaling%");
      if (error) throw error;
      return (data ?? []).map((l: any) => {
        const d = String(l.description);
        const num = (k: string) => Number(d.match(new RegExp(`${k} (-?[\\d.]+)`))?.[1] ?? 0);
        return { date: l.fin_journal_entries.entry_date as string, invoice: l.fin_journal_entries.reference as string, text: l.fin_journal_entries.description as string, gross: num("bruto"), net: num("netto"), fee: Number(l.debit) };
      }).sort((a: any, b: any) => b.date.localeCompare(a.date));
    },
  });
  const sum = data.reduce((s: number, r: any) => s + r.fee, 0);
  const exportCsv = () => {
    const rows = [["Datum", "Factuur", "Omschrijving", "Bruto (klant 400000)", "Netto (bank)", "Commissie (653000)"],
      ...data.map((r: any) => [r.date, r.invoice, r.text, r.gross.toFixed(2).replace(".", ","), r.net.toFixed(2).replace(".", ","), r.fee.toFixed(2).replace(".", ",")])];
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `kaartcommissies-653000-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };
  return (
    <div className="rounded border border-border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Kaartcommissies op 653000 Bankkosten</h3>
        <Button size="sm" variant="outline" disabled={!data.length} onClick={exportCsv}>Exporteren voor boekhouder</Button>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Per betaling: bruto bedrag afgeboekt van de klant, netto op de bank, verschil op bankkosten. Totaal {eur(sum)} ({data.length} boekingen).</p>
      {data.length > 0 && <div className="mt-2 max-h-60 overflow-y-auto">
        <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground"><th>Datum</th><th>Factuur</th><th className="text-right">Bruto</th><th className="text-right">Netto</th><th className="text-right">Commissie</th></tr></thead>
          <tbody>{data.map((r: any, i: number) => <tr key={i} className="border-t border-border"><td>{r.date}</td><td>{r.invoice}</td><td className="text-right">{eur(r.gross)}</td><td className="text-right">{eur(r.net)}</td><td className="text-right">{eur(r.fee)}</td></tr>)}</tbody></table>
      </div>}
    </div>
  );
}
