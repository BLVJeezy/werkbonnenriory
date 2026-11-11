import type { Database } from "@/integrations/supabase/types";
import type { SearchChoice } from "@/lib/choice-search";
import { euro } from "@/lib/billing";

type Product = Database["public"]["Tables"]["products"]["Row"];

/**
 * Product choices for the work-order material search bar.
 * Alias and description are searchable on top of the name; the price is only
 * ever part of the label when the viewer is allowed to see prices.
 */
export function materialChoices(products: Product[], showPrices: boolean): SearchChoice[] {
  return products
    .slice()
    .sort((a, b) => (a.alias || a.name).localeCompare(b.alias || b.name, "nl"))
    .map((p) => ({
      value: p.id,
      label: `${p.alias ? `${p.alias} — ` : ""}${p.name} (${p.unit})${showPrices ? ` — ${euro(Number(p.price))}` : ""}`,
      search: `${p.alias ?? ""} ${p.description ?? ""}`,
    }));
}
