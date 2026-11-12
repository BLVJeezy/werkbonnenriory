import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PAYMENT_METHODS, VAT_RULES } from "./supplier-rules";
import { nextBic } from "./iban-bic";
import { syncSupplierPaymentMethod } from './supplier-payment';

export const saveSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (i: {
      id: string;
      name: string;
      vat_number: string | null;
      iban: string | null;
      bic?: string | null;
      payment_method: string;
      vat_rule: string;
      vat_deductible_percent: number;
    }) => {
      if (
        !i.name.trim() ||
        !(i.payment_method in PAYMENT_METHODS) ||
        !(i.vat_rule in VAT_RULES) ||
        !Number.isFinite(i.vat_deductible_percent) ||
        i.vat_deductible_percent < 0 ||
        i.vat_deductible_percent > 100
      )
        throw new Error("Controleer naam, betaalwijze en btw-instellingen.");
      return i;
    },
  )
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!admin) throw new Error("Alleen voor beheerder");
    const { id, ...fields } = data;
    const vat = data.vat_number?.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const match_key = vat
      ? `vat:${vat}`
      : `name:${data.name.trim().toLowerCase().replace(/\s+/g, " ")}`;
    const { error } = await context.supabase
      .from("suppliers")
      .update({ ...fields, name: data.name.trim(), match_key })
      .eq("id", id);
    if (error)
      throw new Error(error.code === "23505" ? "Deze leverancier bestaat al." : error.message);
    await syncSupplierPaymentMethod(context.supabase, id, data.payment_method);
    return { ok: true };
  });
/** Completes the BIC of every supplier whose IBAN points at a known bank; a typed BIC is never touched. */
export const fillSupplierBics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!admin) throw new Error("Alleen voor beheerder");
    const { data: rows, error } = await context.supabase.from("suppliers").select("id,iban,bic");
    if (error) throw new Error(error.message);
    let filled = 0;
    let skipped = 0;
    for (const r of rows ?? []) {
      const bic = nextBic(null, r.bic, r.iban);
      if (!bic) {
        if (r.iban && !r.bic) skipped++;
        continue;
      }
      if (bic === r.bic) continue;
      const { error: e } = await context.supabase.from("suppliers").update({ bic }).eq("id", r.id);
      if (e) throw new Error(e.message);
      filled++;
    }
    return { filled, skipped };
  });
