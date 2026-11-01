import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { disconnectPonto, pontoStatus, savePontoCredentials, syncPontoNow } from "@/lib/ponto.functions";

export function PontoConnection() {
  const status = useServerFn(pontoStatus);
  const save = useServerFn(savePontoCredentials);
  const disconnect = useServerFn(disconnectPonto);
  const check = useServerFn(syncPontoNow);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["ponto"], queryFn: () => status() });
  const [id, setId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); await Promise.all(["ponto", "fin", "facturen", "finance-local-sales"].map(key => qc.invalidateQueries({ queryKey: [key] }))); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Ponto niet bereikbaar"); }
    finally { setBusy(false); }
  };
  return <div className="flex flex-wrap items-end gap-2 border-b border-border pb-3">
    {data?.connected ? <>
      <Button size="sm" disabled={busy} onClick={() => run(async () => { const result = await check(); toast.success(`${result.matched.length} facturen afgepunt`); })}>Betalingen controleren</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => { if (confirm("Ponto-koppeling verwijderen?")) void run(() => disconnect()); }}>Loskoppelen</Button>
    </> : <>
      <label className="text-sm">Client ID<Input value={id} onChange={e => setId(e.target.value)} autoComplete="off" /></label>
      <label className="text-sm">Client secret<Input type="password" value={secret} onChange={e => setSecret(e.target.value)} autoComplete="new-password" /></label>
      <Button size="sm" disabled={busy || !id.trim() || !secret.trim()} onClick={() => run(async () => { await save({ data: { clientId: id, clientSecret: secret } }); setId(""); setSecret(""); toast.success("Ponto gekoppeld"); })}>Ponto koppelen</Button>
    </>}
  </div>;
}