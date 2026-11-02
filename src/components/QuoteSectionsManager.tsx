import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect } from "@/components/SearchSelect";

export type QuoteSection = { id: string; name: string; sort_order: number; items: { id: string; product_id: string; quantity: number; sort_order: number }[] };

export const quoteSectionsQuery = {
  queryKey: ["quote_sections"],
  queryFn: async (): Promise<QuoteSection[]> => {
    const { data, error } = await supabase.from("quote_sections").select("id, name, sort_order, items:quote_section_items(id, product_id, quantity, sort_order)").order("sort_order");
    if (error) throw error;
    return (data ?? []).map((s: any) => ({ ...s, items: [...(s.items ?? [])].sort((a: any, b: any) => a.sort_order - b.sort_order).map((i: any) => ({ ...i, quantity: Number(i.quantity) })) }));
  },
};

/** Admin beheert de vaste titels voor offertes/bestekken en de producten die standaard onder elke titel komen. */
export function QuoteSectionsManager({ products }: { products: { id: string; name: string; alias?: string | null; unit: string }[] }) {
  const qc = useQueryClient();
  const { data: sections = [] } = useQuery(quoteSectionsQuery);
  const [newName, setNewName] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["quote_sections"] });
  const run = async (p: PromiseLike<{ error: any }>) => { const { error } = await p; if (error) toast.error(error.message); refresh(); };

  return (
    <div className="space-y-3 rounded-md border bg-card p-4">
      <p className="text-sm text-muted-foreground">Deze titels kun je in elke offerte of elk bestek aanvinken. De producten eronder komen er dan automatisch op; aantallen pas je in de offerte nog aan.</p>
      {sections.map((s, idx) => (
        <div key={s.id} className="space-y-2 rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input className="min-w-48 flex-1 font-bold" defaultValue={s.name} aria-label="Titel"
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== s.name) void run(supabase.from("quote_sections").update({ name: v }).eq("id", s.id)); }} />
            <Button type="button" size="sm" variant="ghost" disabled={idx === 0} aria-label="Omhoog" onClick={async () => {
              const prev = sections[idx - 1];
              await supabase.from("quote_sections").update({ sort_order: prev.sort_order }).eq("id", s.id);
              await run(supabase.from("quote_sections").update({ sort_order: s.sort_order === prev.sort_order ? s.sort_order + 1 : s.sort_order }).eq("id", prev.id));
            }}>↑</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { if (confirm(`Titel "${s.name}" verwijderen?`)) void run(supabase.from("quote_sections").delete().eq("id", s.id)); }}>Verwijderen</Button>
          </div>
          {s.items.map((it) => {
            const p = products.find((x) => x.id === it.product_id);
            return (
              <div key={it.id} className="flex items-center gap-2 pl-3 text-sm">
                <span className="flex-1">{p?.name ?? "Verwijderd product"}</span>
                <Input type="number" step="any" min="0" className="w-20" defaultValue={String(it.quantity)} aria-label="Aantal"
                  onBlur={(e) => { const q = Number(e.target.value); if (q > 0 && q !== it.quantity) void run(supabase.from("quote_section_items").update({ quantity: q }).eq("id", it.id)); }} />
                <span className="w-10 text-muted-foreground">{p?.unit}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => void run(supabase.from("quote_section_items").delete().eq("id", it.id))}>✕</Button>
              </div>
            );
          })}
          <SearchSelect className="pl-3 sm:w-80" placeholder="+ Product toevoegen…" searchPlaceholder="Zoek product of alias…" value=""
            options={products.map((p) => ({ value: p.id, label: p.name, search: p.alias ?? "" }))}
            onChange={(pid) => void run(supabase.from("quote_section_items").insert({ section_id: s.id, product_id: pid, quantity: 1, sort_order: s.items.length + 1 }))} />
        </div>
      ))}
      <div className="flex gap-2">
        <Input placeholder="Nieuwe titel" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button type="button" variant="outline" disabled={!newName.trim()} onClick={() => {
          void run(supabase.from("quote_sections").insert({ name: newName.trim(), sort_order: (sections.at(-1)?.sort_order ?? 0) + 1 }));
          setNewName("");
        }}>Titel toevoegen</Button>
      </div>
    </div>
  );
}
