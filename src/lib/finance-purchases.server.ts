const API = "https://app-02.simpla.be/api/";
export async function syncFinancePurchaseImports(db: any, userId: string) {
  const key = process.env["SIMPLA_API_TOKEN"];
  if (!key) return { ok: false as const, error: "Simpla-aankoopkoppeling niet ingesteld." };
  const { data: company, error: companyError } = await db.from("companies").select("id").eq("user_id", userId).eq("simpla_bound", true).maybeSingle();
  if (companyError || !company) return { ok: false as const, error: "Koppel eerst de Simpla-administratie aan het juiste bedrijf." };
  const read = async (type: string) => {
    const url = new URL(API);
    url.searchParams.set("token", key);
    url.searchParams.set("dataType", type);
    const response = await fetch(url);
    if (!response.ok) throw new Error("Simpla-aankoopgegevens tijdelijk niet beschikbaar");
    const body = await response.json() as { status: string; data: any[] };
    if (body.status !== "OK" || !Array.isArray(body.data)) throw new Error("Simpla-aankoopgegevens konden niet gelezen worden");
    return body.data;
  };
  try {
    const [bills, suppliers] = await Promise.all([read("bill_purchase"), read("supplier")]);
    const names = new Map(suppliers.map(s => [String(s.supplierId), s.supplierName]));
    const rows = bills.filter(b => b.billDatabaseId != null).map(b => ({ user_id: userId, simpla_id: String(b.billDatabaseId), supplier_name: names.get(String(b.billCustomerId)) ?? null, bill_number: b.billId ?? null, bill_date: b.billDate?.slice(0, 10) ?? null, total_ex_vat: Number(b.billTotalExVAT ?? 0), total_inc_vat: Number(b.billTotalIncVAT ?? 0) }));
    for (let from = 0; from < rows.length; from += 200) {
      const { error } = await db.from("fin_supplier_imports").upsert(rows.slice(from, from + 200), { onConflict: "user_id,simpla_id", ignoreDuplicates: true });
      if (error) throw new Error("Aankoopgegevens opslaan mislukt");
    }
    const { error } = await db.from("fin_sync_status").upsert({ user_id: userId, company_id: company.id, source: "simpla", last_success_at: new Date().toISOString(), last_error: null, last_error_at: null }, { onConflict: "company_id,source" });
    if (error) throw new Error("Synchronisatiestatus opslaan mislukt");
    return { ok: true as const, imported: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Simpla-aankoopinlezing mislukt";
    await db.from("fin_sync_status").upsert({ user_id: userId, company_id: company.id, source: "simpla", last_error: message, last_error_at: new Date().toISOString() }, { onConflict: "company_id,source" });
    return { ok: false as const, error: message };
  }
}