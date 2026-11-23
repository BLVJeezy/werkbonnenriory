export type SearchCategory =
  | "customers"
  | "work_orders"
  | "quotes"
  | "invoices"
  | "purchase_invoices"
  | "suppliers"
  | "products"
  | "contracts"
  | "bank_tx";

export interface GlobalSearchItem {
  id: string;
  category: SearchCategory;
  title: string;
  subtitle: string;
  meta?: string;
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string>;
}

export const CATEGORY_LABELS: Record<SearchCategory, string> = {
  customers: "Klanten",
  work_orders: "Werkbonnen & taken",
  quotes: "Offertes & bestekken",
  invoices: "Verkoopfacturen",
  purchase_invoices: "Aankoopfacturen",
  suppliers: "Leveranciers",
  products: "Producten",
  contracts: "Contracten",
  bank_tx: "Bankverrichtingen",
};

/** Escape PostgREST filter/ilike special characters so user input never breaks `.or(...)`. */
export function sanitizeSearchTerm(raw: string): string {
  return raw
    .replace(/[,()%*\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export function allowedSearchCategories(role: string | null): SearchCategory[] {
  if (role === "admin") {
    return [
      "customers",
      "work_orders",
      "quotes",
      "invoices",
      "purchase_invoices",
      "suppliers",
      "products",
      "contracts",
      "bank_tx",
    ];
  }
  if (role === "marketing") {
    return ["customers"];
  }
  if (role === "technician") {
    return ["work_orders"];
  }
  return [];
}