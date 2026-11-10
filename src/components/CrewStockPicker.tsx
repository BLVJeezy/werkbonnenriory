import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Prod = { id: string; name: string; alias?: string | null; unit: string; price: number | string };

/** Quick selection of the crew's assigned products; the DB trigger deducts each material row exactly once. */
export function CrewStockPicker({ workOrderId, technicianId, prods, onDone }: { workOrderId: string; technicianId: string; prods: Prod[]; onDone: () => void }) {
  const qc = useQueryClient();
  const stock = useQuery({
    queryKey: ["crew_stock", technicianId],
    queryFn: async () => (await supabase.from("crew_stock").select("product_id, quantity").eq("technician_id", technicianId).gt("quantity", 0)).data ?? [],
  });
  const [qty, setQty] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const items = (stock.data ?? []).map((s) => ({ ...s, p: prods.find((p) => p.id === s.product_id) })).filter((x) => x.p);
  if (!items.length) return null;

  async function use(productId: string, p: Prod) {
    if (busy) return;
    const n = Number(qty[productId] ?? "1");
    if (!(n > 0)) return toast.error("Aantal moet groter dan 0 zijn");
    setBusy(productId);
    const { error } = await supabase.from("materials").insert({ work_order_id: workOrderId, product_id: p.id, name: p.name, quantity: n, unit: p.unit, unit_price: Number(p.price), from_crew_stock: true });
    setBusy(null);
    if (error) return toast.error(error.message);
    setQty({ ...qty, [productId]: "1" });
    qc.invalidateQueries({ queryKey: ["crew_stock", technicianId] });
    onDone();
  }

  return (
    <div className="mt-4 border-t pt-3">
      <h3 className="mb-2 text-sm font-black uppercase">Verbruik uit ploegvoorraad</h3>
      <ul className="space-y-2">
        {items.map(({ product_id, quantity, p }) => (
          <li key={product_id} className="flex flex-wrap items-center gap-2">
            <span className="min-w-40 flex-1">{p!.alias || p!.name} <span className="text-xs text-muted-foreground">({Number(quantity)} {p!.unit} beschikbaar)</span></span>
            <Input className="w-20" type="number" min="0" step="any" max={Number(quantity)} value={qty[product_id] ?? "1"} onChange={(e) => setQty({ ...qty, [product_id]: e.target.value })} />
            <Button size="sm" disabled={busy !== null} onClick={() => use(product_id, p!)}>{busy === product_id ? "…" : "Verbruikt"}</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
