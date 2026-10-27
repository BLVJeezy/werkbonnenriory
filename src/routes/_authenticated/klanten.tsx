import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAddress } from "@/lib/address";
import { customerKey, customerPatch, rowsToCustomers, type CustomerRow } from "@/lib/customers";

export const Route = createFileRoute("/_authenticated/klanten")({
  head: () => ({ meta: [{ title: "Klanten — Riory Werkbonnen" }, { name: "description", content: "Opgeslagen klanten van Riory, met Excel-import." }, { property: "og:title", content: "Klanten — Riory Werkbonnen" }, { property: "og:description", content: "Opgeslagen klanten van Riory, met Excel-import." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Klanten,
});

const FIELDS: { key: keyof CustomerRow; label: string; className: string }[] = [
  { key: "name", label: "Naam", className: "min-w-48 flex-1" },
  { key: "street", label: "Straat", className: "min-w-40 flex-[2]" },
  { key: "house_number", label: "Nr.", className: "w-24" },
  { key: "postal_code", label: "Postcode", className: "w-32" },
  { key: "city", label: "Plaats", className: "min-w-36 flex-1" },
  { key: "phone", label: "Telefoon", className: "w-40" },
  { key: "email", label: "E-mail", className: "min-w-44 flex-1" },
  { key: "billing_email", label: "E-mail facturatie", className: "min-w-44 flex-1" },
  { key: "vat_number", label: "Btw-nummer", className: "w-44" },
  { key: "project_name", label: "Projectnaam", className: "min-w-36 flex-1" },
];

function Klanten() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const { data = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => (await supabase.from("customers").select("*").order("name")).data ?? [],
  });
  const rows = data.filter((c) => !q || `${c.name} ${c.city ?? ""} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(q.toLowerCase()));

  function openEdit(c: (typeof data)[number]) {
    setEditing(editing === c.id ? null : c.id);
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, (c[f.key] as string | null) ?? ""])));
  }

  async function save(c: (typeof data)[number]) {
    const patch = customerPatch(form as Partial<CustomerRow>);
    if (!patch.name) {
      toast.error("De naam mag niet leeg zijn.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("customers").update(patch).eq("id", c.id);
    setSaving(false);
    if (error) {
      toast.error(error.code === "23505" ? "Er bestaat al een klant met deze naam en postcode." : error.message);
      return;
    }
    toast.success(`${patch.name} bijgewerkt`);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

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
        Kolommen: Naam, Straat, Nr., Postcode, Plaats, Telefoon, E-mail, E-mail facturatie, Btw-nummer. Bestaande klanten (zelfde naam en postcode) worden bijgewerkt. Nieuwe taken bewaren de klant automatisch. Klik bij een klant op <strong>Bewerken</strong> om gegevens te verbeteren.
      </p>
      <Input placeholder="Zoeken…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="divide-y rounded-md border bg-card">
        {rows.length === 0 && <p className="p-4 text-muted-foreground">Geen klanten.</p>}
        {rows.map((c) => (
          <div key={c.id} className="p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-48 flex-1">
                <div className="font-bold">{c.name}{c.project_name && <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs font-bold">{c.project_name}</span>}</div>
                <div className="text-sm text-muted-foreground">{formatAddress(c) || "Geen adres"}</div>
              </div>
              <div className="text-sm">{[c.phone, c.email, c.billing_email && `factuur: ${c.billing_email}`, c.vat_number].filter(Boolean).join(" · ")}</div>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>{editing === c.id ? "Sluiten" : "Bewerken"}</Button>
                <Button size="sm" variant="ghost" onClick={async () => {
                  if (!confirm(`${c.name} verwijderen uit klanten?`)) return;
                  await supabase.from("customers").delete().eq("id", c.id);
                  qc.invalidateQueries({ queryKey: ["customers"] });
                }}>Verwijderen</Button>
              </div>
            </div>
            {editing === c.id && (
              <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
                <div className="flex flex-wrap gap-2">
                  {FIELDS.map((f) => (
                    <label key={f.key} className={`space-y-1 ${f.className}`}>
                      <span className="block text-xs font-bold uppercase text-muted-foreground">{f.label}</span>
                      <Input
                        value={form[f.key] ?? ""}
                        onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.label}
                      />
                    </label>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" disabled={saving} onClick={() => save(c)}>{saving ? "Bezig…" : "Opslaan"}</Button>
                  <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(null)}>Annuleren</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
