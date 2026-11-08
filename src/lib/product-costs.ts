export type CostLine = { key: "regenput" | "septisch"; date: string; amount: number };

const n = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (s: string | null | undefined) => n(s).replace(/[^a-z0-9]/g, "");

/** Kostgroep van een aankooplijn: regenputreiniging enkel door Rioclean, septische putten bij elke leverancier. */
export function costKey(supplier: string | null | undefined, description: string | null | undefined): CostLine["key"] | null {
  const d = n(description);
  if (d.includes("septisch")) return "septisch";
  if (norm(supplier).includes("rioclean") && /regen(water)?put/.test(d)) return "regenput";
  return null;
}

export type SimplaPurchaseBill = { billDatabaseId: number; billCustomerId?: number | null; billDate?: string | null; billStatus?: string | null; documentId?: string | null };
export type SimplaPurchaseLine = { billDatabaseId: number; billLineProductDescription?: string | null; billLineUnitPrice?: number | null; billLineNumber?: number | null; billLineDiscount?: number | null };
export type AppPurchase = { supplier_name: string | null; invoice_number: string | null; invoice_date: string | null; lines: unknown };

/** Pure: kostlijnen uit Simpla en de app; Simpla-facturen die ook in de app staan (leverancier + nummer) tellen één keer. */
export function productCostLines(
  simpla: { bills: SimplaPurchaseBill[]; lines: SimplaPurchaseLine[]; suppliers: { supplierId: number; supplierName?: string | null }[] },
  app: AppPurchase[], from: string, to: string,
): CostLine[] {
  const out: CostLine[] = [];
  const inApp = new Set(app.map((p) => `${norm(p.supplier_name)}|${norm(p.invoice_number)}`));
  for (const p of app) {
    const d = (p.invoice_date ?? "").slice(0, 10);
    if (!d || d < from || d > to) continue;
    for (const l of (Array.isArray(p.lines) ? p.lines : []) as Record<string, unknown>[]) {
      const k = costKey(p.supplier_name, String(l?.["description"] ?? ""));
      if (k) out.push({ key: k, date: d, amount: Number(l?.["amount"] ?? Number(l?.["quantity"] ?? 0) * Number(l?.["unitPrice"] ?? 0)) });
    }
  }
  const sup = new Map(simpla.suppliers.map((s) => [s.supplierId, s.supplierName ?? ""]));
  const bills = new Map<number, { d: string; s: string }>();
  for (const b of simpla.bills) {
    const d = (b.billDate ?? "").slice(0, 10);
    const s = sup.get(Number(b.billCustomerId)) ?? "";
    if (!d || d < from || d > to || b.billStatus === "DRAFT") continue;
    if (b.documentId && inApp.has(`${norm(s)}|${norm(b.documentId)}`)) continue;
    bills.set(b.billDatabaseId, { d, s });
  }
  for (const l of simpla.lines) {
    const b = bills.get(l.billDatabaseId);
    if (!b) continue;
    const k = costKey(b.s, l.billLineProductDescription);
    if (k) out.push({ key: k, date: b.d, amount: Number(l.billLineNumber ?? 0) * Number(l.billLineUnitPrice ?? 0) * (1 - Number(l.billLineDiscount ?? 0) / 100) });
  }
  return out;
}
