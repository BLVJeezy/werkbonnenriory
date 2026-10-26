import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { importFromMailbox, MAILBOX_ADDRESS } from "@/lib/mailbox.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/werkbonnen/")({
  head: () => ({ meta: [{ title: "Werkbonnen — Riory" }] }),
  component: Lijst,
});

const FILTERS = ["alle", "nieuw", "toegewezen", "afgetekend"] as const;

function Lijst() {
  const qc = useQueryClient();
  const runImport = useServerFn(importFromMailbox);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("alle");
  const { data = [] } = useQuery({
    queryKey: ["work_orders"],
    queryFn: async () =>
      (await supabase.from("work_orders").select("*, technicians(name)").order("created_at", { ascending: false })).data ?? [],
  });
  const rows = filter === "alle" ? data : data.filter((w) => w.status === filter);

  async function doImport() {
    setBusy(true);
    try {
      const r = await runImport();
      if (r.imported > 0) toast.success(`${r.imported} nieuwe werkbon(nen) aangemaakt`);
      else toast.info(`Geen nieuwe mails voor ${MAILBOX_ADDRESS}`);
      if (r.errors?.length) toast.error(`${r.errors.length} mail(s) konden niet gelezen worden`);
      qc.invalidateQueries({ queryKey: ["work_orders"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ophalen mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-3xl font-black uppercase">Werkbonnen</h1>
          <p className="text-sm text-muted-foreground">Klanten uit {MAILBOX_ADDRESS}</p>
        </div>
        <Button className="ml-auto" onClick={doImport} disabled={busy}>
          {busy ? "Mails lezen…" : "Mails ophalen"}
        </Button>
      </div>
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">
            {f}
          </Button>
        ))}
      </div>
      <div className="grid gap-3">
        {rows.length === 0 && <div className="rounded-md border bg-card p-6 text-muted-foreground">Geen werkbonnen.</div>}
        {rows.map((w) => (
          <Link
            key={w.id}
            to="/werkbonnen/$id"
            params={{ id: w.id }}
            className="flex flex-wrap items-center gap-4 rounded-md border-l-4 border-primary bg-card p-4 shadow-sm transition hover:shadow-md"
          >
            <span className="font-mono text-sm text-muted-foreground">#{w.number}</span>
            <div className="min-w-0 flex-1">
              <div className="font-bold">{w.customer_name}</div>
              <div className="truncate text-sm text-muted-foreground">{w.address ?? "Geen adres"}</div>
            </div>
            <span className="text-sm">{w.technicians?.name ?? "Niet toegewezen"}</span>
            <Badge variant={w.status === "afgetekend" ? "secondary" : "default"} className="capitalize">
              {w.status}
            </Badge>
          </Link>
        ))}
      </div>
    </div>
  );
}
