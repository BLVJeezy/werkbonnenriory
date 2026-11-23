import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  allowedSearchCategories,
  sanitizeSearchTerm,
  type GlobalSearchItem,
} from "./global-search";

const eur = (n: number) =>
  new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR" }).format(n);

export const searchSystem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { query: string }) => {
    const clean = sanitizeSearchTerm(input.query ?? "");
    if (clean.length < 2) throw new Error("Geef minstens 2 tekens in");
    return { query: clean };
  })
  .handler(async ({ data, context }): Promise<{ items: GlobalSearchItem[] }> => {
    const sb = context.supabase as any;
    const { data: roleRow } = await sb
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    const role = (roleRow?.role as string | undefined) ?? null;
    const cats = new Set(allowedSearchCategories(role));
    if (!cats.size) return { items: [] };

    const q = data.query;
    const pat = `%${q}%`;
    const isNum = /^\d+$/.test(q);
    const limit = 8;

    const tasks: Promise<GlobalSearchItem[]>[] = [];

    if (cats.has("customers")) {
      tasks.push(
        sb
          .from("customers")
          .select("id,name,email,phone,city,street,vat_number,customer_code")
          .or(
            `name.ilike.${pat},email.ilike.${pat},phone.ilike.${pat},city.ilike.${pat},street.ilike.${pat},vat_number.ilike.${pat},customer_code.ilike.${pat}`,
          )
          .order("created_at", { ascending: false })
          .limit(limit)
          .then(({ data: rows }: any) =>
            (rows ?? []).map((r: any): GlobalSearchItem => ({
              id: r.id,
              category: "customers",
              title: r.name || "Klant",
              subtitle: [r.street, r.city, r.email, r.phone].filter(Boolean).join(" · "),
              meta: r.customer_code || r.vat_number || undefined,
              to: "/klanten",
            })),
          )
          .catch(() => []),
      );
    }

    if (cats.has("work_orders")) {
      const orParts = [
        `customer_name.ilike.${pat}`,
        `description.ilike.${pat}`,
        `notes.ilike.${pat}`,
        `street.ilike.${pat}`,
        `city.ilike.${pat}`,
        `project_name.ilike.${pat}`,
        `worksite_street.ilike.${pat}`,
        `worksite_city.ilike.${pat}`,
      ];
      if (isNum) orParts.push(`work_order_number.eq.${Number(q)}`);
      tasks.push(
        sb
          .from("work_orders")
          .select("id,work_order_number,customer_name,description,scheduled_date,city,status")
          .or(orParts.join(","))
          .order("scheduled_date", { ascending: false, nullsFirst: false })
          .limit(limit)
          .then(({ data: rows }: any) =>
            (rows ?? []).map((r: any): GlobalSearchItem => ({
              id: r.id,
              category: "work_orders",
              title: `${r.work_order_number ? `WB ${r.work_order_number}` : "Nieuw"} · ${r.customer_name || "Taak"}`,
              subtitle: [r.city, r.description].filter(Boolean).join(" — ").slice(0, 110),
              meta: r.scheduled_date || r.status || undefined,
              to: "/werkbonnen/$id",
              params: { id: r.id },
            })),
          )
          .catch(() => []),
      );
    }

    if (cats.has("quotes")) {
      tasks.push(
        sb
          .from("quotes")
          .select("id,number,title,customer_name,status,kind,created_at")
          .or(`number.ilike.${pat},title.ilike.${pat},customer_name.ilike.${pat},notes.ilike.${pat}`)
          .order("created_at", { ascending: false })
          .limit(limit)
          .then(({ data: rows }: any) =>
            (rows ?? []).map((r: any): GlobalSearchItem => ({
              id: r.id,
              category: "quotes",
              title: `${r.number || "Offerte"} · ${r.customer_name || ""}`.trim(),
              subtitle: r.title || (r.kind === "verzekering" ? "Verzekeringsbestek" : "Offerte"),
              meta: r.status || undefined,
              to: "/offertes",
            })),
          )
          .catch(() => []),
      );
    }

    if (cats.has("invoices")) {
      tasks.push(
        sb
          .from("invoices")
          .select("id,number,customer,issue_date,total,status,kind,note")
          .or(`number.ilike.${pat},note.ilike.${pat},customer->>name.ilike.${pat}`)
          .order("issue_date", { ascending: false })
          .limit(limit)
          .then(({ data: rows }: any) =>
            (rows ?? []).map((r: any): GlobalSearchItem => ({
              id: r.id,
              category: "invoices",
              title: `${r.kind === "creditnota" ? "CN" : "Factuur"} ${r.number} · ${r.customer?.name ?? ""}`.trim(),
              subtitle: [r.issue_date, r.status, r.note].filter(Boolean).join(" · "),
              meta: eur(Number(r.total ?? 0)),
              to: "/facturen",
            })),
          )
          .catch(() => []),
      );
    }

    if (cats.has("purchase_invoices")) {
      tasks.push(
        sb
          .from("purchase_invoices")
          .select("id,invoice_number,supplier_name,invoice_date,total,status,payment_ref")
          .or(`invoice_number.ilike.${pat},supplier_name.ilike.${pat},payment_ref.ilike.${pat}`)
          .order("invoice_date", { ascending: false, nullsFirst: false })
          .limit(limit)
          .then(({ data: rows }: any) =>
            (rows ?? []).map((r: any): GlobalSearchItem => ({
              id: r.id,
              category: "purchase_invoices",
              title: `${r.supplier_name || "Leverancier"}${r.invoice_number ? ` · ${r.invoice_number}` : ""}`,
              subtitle: [r.invoice_date, r.status, r.payment_ref].filter(Boolean).join(" · "),
              meta: eur(Number(r.total ?? 0)),
              to: "/aankoopfacturen/$id",
              params: { id: r.id },
            })),
          )
          .catch(() => []),
      );
    }

    if (cats.has("suppliers")) {
      tasks.push(
        sb
          .from("suppliers")
          .select("id,name,vat_number,email,iban")
          .or(`name.ilike.${pat},vat_number.ilike.${pat},email.ilike.${pat},iban.ilike.${pat}`)
          .order("name")
          .limit(limit)
          .then(({ data: rows }: any) =>
            (rows ?? []).map((r: any): GlobalSearchItem => ({
              id: r.id,
              category: "suppliers",
              title: r.name || "Leverancier",
              subtitle: [r.vat_number, r.email, r.iban].filter(Boolean).join(" · "),
              to: "/leveranciers",
            })),
          )
          .catch(() => []),
      );
    }

    if (cats.has("products")) {
      tasks.push(
        sb
          .from("products")
          .select("id,name,description,price,unit")
          .or(`name.ilike.${pat},description.ilike.${pat}`)
          .order("name")
          .limit(limit)
          .then(({ data: rows }: any) =>
            (rows ?? []).map((r: any): GlobalSearchItem => ({
              id: r.id,
              category: "products",
              title: r.name || "Product",
              subtitle: (r.description || "").slice(0, 100),
              meta: `${eur(Number(r.price ?? 0))}${r.unit ? ` / ${r.unit}` : ""}`,
              to: "/producten",
            })),
          )
          .catch(() => []),
      );
    }

    if (cats.has("contracts")) {
      tasks.push(
        sb
          .from("contracts")
          .select("id,contract_number,customer_name,description,status")
          .or(`contract_number.ilike.${pat},customer_name.ilike.${pat},description.ilike.${pat}`)
          .order("created_at", { ascending: false })
          .limit(limit)
          .then(({ data: rows }: any) =>
            (rows ?? []).map((r: any): GlobalSearchItem => ({
              id: r.id,
              category: "contracts",
              title: `${r.contract_number || "Contract"} · ${r.customer_name || ""}`.trim(),
              subtitle: (r.description || "").slice(0, 100),
              meta: r.status || undefined,
              to: "/contracten",
            })),
          )
          .catch(() => []),
      );
    }

    if (cats.has("bank_tx")) {
      tasks.push(
        sb
          .from("fin_bank_tx")
          .select("id,tx_date,amount,counterparty,counterparty_account,description")
          .or(`counterparty.ilike.${pat},description.ilike.${pat},counterparty_account.ilike.${pat}`)
          .order("tx_date", { ascending: false })
          .limit(limit)
          .then(({ data: rows }: any) =>
            (rows ?? []).map((r: any): GlobalSearchItem => ({
              id: r.id,
              category: "bank_tx",
              title: r.counterparty || "Bankverrichting",
              subtitle: [r.tx_date, r.description].filter(Boolean).join(" · ").slice(0, 110),
              meta: eur(Number(r.amount ?? 0)),
              to: "/boekhouding",
              search: { tab: "bank" },
            })),
          )
          .catch(() => []),
      );
    }

    const settled = await Promise.all(tasks);
    return { items: settled.flat() };
  });