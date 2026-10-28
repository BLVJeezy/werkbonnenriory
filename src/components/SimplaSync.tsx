import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { retrySimpla, simplaOverview } from "@/lib/simpla.functions";

export function SimplaSync() {
  const overview = useServerFn(simplaOverview);
  const retry = useServerFn(retrySimpla);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error } = useQuery({ queryKey: ["simpla_sync"], queryFn: () => overview(), refetchInterval: 10000 });
  async function again(id: string) {
    setBusy(id);
    try { const result = await retry({ data: { workOrderId: id } }); toast.error(result.error); }
    catch { toast.error("Simpla controleren mislukt"); }
    finally { setBusy(null); await qc.invalidateQueries({ queryKey: ["simpla_sync"] }); }
  }
  return <section className="space-y-3 border-t pt-6">
    <h2 className="text-lg font-black uppercase">Simpla</h2>
    <p className="text-sm text-muted-foreground">{data?.configured ? "Token ingesteld · Simpla weigert schrijftoegang (HTTP 403). Activeer het Simpla API-abonnement (€15/maand) om factuuraanmaak verder te koppelen." : "Simpla-token nog niet ingesteld."}</p>
    {error && <p className="text-destructive">Overzicht ophalen mislukt.</p>}
    <ul className="divide-y">{data?.rows.map((row) => <li key={row.work_order_id} className="flex flex-wrap items-center gap-3 py-3">
      <span className="font-mono font-bold">#{row.work_orders?.number}</span><span className="flex-1">{row.work_orders?.customer_name}</span>
      <span className="text-sm">{row.status === "sent" ? `Naar Simpla gestuurd · ${row.remote_id ?? ""}` : row.status === "uncertain" ? "Controle in Simpla nodig" : "Wacht op Simpla"}</span>
      {row.status === "waiting" && <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => again(row.work_order_id)}>{busy === row.work_order_id ? "Bezig…" : "Opnieuw proberen"}</Button>}
      {row.error && <p className="w-full text-sm text-destructive">{row.error}</p>}
    </li>)}{data && !data.rows.length && <li className="py-3 text-muted-foreground">Nog geen werkbonnen in de Simpla-wachtrij.</li>}</ul>
  </section>;
}