import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAddress } from "@/lib/address";
import { customerKey, rowsToCustomers } from "@/lib/customers";

export const Route = createFileRoute("/_authenticated/klanten")({
  head: () => ({ meta: [{ title: "Klanten — Riory Werkbonnen" }, { name: "description", content: "Opgeslagen klanten van Riory, met Excel-import." }, { property: "og:title", content: "Klanten — Riory Werkbonnen" }, { property: "og:description", content: "Opgeslagen klanten van Riory, met Excel-import." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Klanten,
});

function Klanten() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => (await supabase.from("customers").select("*").order("name")).data ?? [],
  });
  const rows = data.filter((c) => !q || `${c.name} ${c.city ?? ""} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  async function importExcel(file: File) {
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const sheet = wb.Sheets[wb.SheetNames[0]!]!;
      const parsed = rowsToCustomers(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" }));
      const unique = [...new Map(parsed.map((c) => [customerKey(c), c])).values()];
      if (!unique.length) {
        toast.error("Geen klanten gevonden. Zorg voor een kolom 'Naam'.");
        return;
      }
      const { error } = await supabase.from("customers").upsert(unique, { onConflict: "match_key" });
      if (error) throw error;
      toast.success(`${unique.length} klant(en) ingelezen`);
      qc.invalidateQueries({ queryKey: ["customers"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Inlezen mislukt");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-3xl font-black uppercase">Klanten</h1>
        <label className="ml-auto">
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importExcel(f); }} />
          <Button asChild variant="outline"><span>{busy ? "Inlezen…" : "Excel inlezen"}</span></Button>
        </label>
      </div>
      <p className="text-sm text-muted-foreground">
        Kolommen: Naam, Straat, Nr., Postcode, Plaats, Telefoon, E-mail, E-mail facturatie, Btw-nummer. Bestaande klanten (zelfde naam en postcode) worden bijgewerkt. Nieuwe taken bewaren de klant automatisch.
      </p>
      <Input placeholder="Zoeken…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="divide-y rounded-md border bg-card">
        {rows.length === 0 && <p className="p-4 text-muted-foreground">Geen klanten.</p>}
        {rows.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-48 flex-1">
              <div className="font-bold">{c.name}{c.project_name && <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs font-bold">{c.project_name}</span>}</div>
              <div className="text-sm text-muted-foreground">{formatAddress(c) || "Geen adres"}</div>
            </div>
            <div className="text-sm">{[c.phone, c.email, c.billing_email && `factuur: ${c.billing_email}`, c.vat_number].filter(Boolean).join(" · ")}</div>
            <Button size="sm" variant="ghost" onClick={async () => {
              if (!confirm(`${c.name} verwijderen uit klanten?`)) return;
              await supabase.from("customers").delete().eq("id", c.id);
              qc.invalidateQueries({ queryKey: ["customers"] });
            }}>✕</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
