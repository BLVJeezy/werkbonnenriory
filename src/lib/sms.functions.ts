import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { maskPhone, normalizeMobile, onderwegTemplate } from "@/lib/sms-phone";
import { formatAddress, destinationAddress } from "@/lib/address";

const GATEWAY = "https://connector-gateway.lovable.dev/twilio";

function smsConfig() {
  const missing: string[] = [];
  if (!process.env["LOVABLE_API_KEY"]) missing.push("LOVABLE_API_KEY");
  if (!process.env["TWILIO_API_KEY"]) missing.push("Twilio-koppeling (TWILIO_API_KEY)");
  if (!process.env["TWILIO_SMS_FROM"]) missing.push("Afzender (TWILIO_SMS_FROM)");
  return { configured: missing.length === 0, missing };
}

async function access(supabase: any, userId: string, workOrderId: string) {
  // RLS: admins see all, crews only their assigned orders.
  const { data: wo } = await supabase.from("work_orders").select("*").eq("id", workOrderId).maybeSingle();
  if (!wo) throw new Error("Werkbon niet gevonden of geen toegang");
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  let showContact = !!isAdmin;
  if (!isAdmin) {
    const { data: t } = await supabase.from("technicians").select("id, show_contact").eq("user_id", userId).maybeSingle();
    if (!t || t.id !== wo.technician_id) throw new Error("Geen toegang tot deze werkbon");
    showContact = !!t.show_contact;
  }
  return { wo, isAdmin: !!isAdmin, showContact };
}

function defaultPhone(wo: any): string {
  const cands = [wo.use_site_address ? wo.site_contact_phone : null, wo.phone, wo.site_contact_phone];
  for (const c of cands) if (c && normalizeMobile(c).ok) return c;
  return cands.find(Boolean) ?? "";
}

export const getOnderwegSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { workOrderId: string }) => i)
  .handler(async ({ data, context }) => {
    const { wo, showContact } = await access(context.supabase, context.userId, data.workOrderId);
    const raw = defaultPhone(wo);
    const norm = normalizeMobile(raw);
    const name = (wo.use_site_address && wo.site_contact_name) || wo.customer_name || "";
    const { data: hist } = await context.supabase
      .from("work_order_sms").select("id, created_at, status, to_number, provider_message_id, error")
      .eq("work_order_id", data.workOrderId).order("created_at", { ascending: false }).limit(20);
    return {
      config: smsConfig(),
      canEditNumber: showContact,
      phone: showContact ? raw : norm.ok ? maskPhone(norm.e164) : "",
      phoneValid: norm.ok,
      name: showContact ? name : "",
      address: showContact ? (destinationAddress(wo) ?? formatAddress(wo)) : "",
      template: onderwegTemplate(name),
      history: (hist ?? []).map((h: any) => ({ ...h, to_number: showContact ? h.to_number : maskPhone(h.to_number) })),
    };
  });

export const sendOnderwegSms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { workOrderId: string; requestKey: string; phone?: string; body: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(i.requestKey)) throw new Error("Ongeldige aanvraag");
    const body = String(i.body ?? "").trim();
    if (!body || body.length > 480) throw new Error("Bericht moet tussen 1 en 480 tekens zijn");
    return { ...i, body };
  })
  .handler(async ({ data, context }) => {
    const { wo, showContact } = await access(context.supabase, context.userId, data.workOrderId);
    const cfg = smsConfig();
    if (!cfg.configured) return { ok: false as const, error: `SMS is nog niet ingesteld: ${cfg.missing.join(", ")}. Er is niets verzonden.` };
    // Crews without contact rights cannot redirect the SMS to another number.
    const norm = normalizeMobile(showContact && data.phone ? data.phone : defaultPhone(wo));
    if (!norm.ok) return { ok: false as const, error: norm.error };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Idempotency: one row per click key; a repeated request never sends twice.
    const { data: row, error: insErr } = await supabaseAdmin.from("work_order_sms").insert({
      work_order_id: wo.id, request_key: data.requestKey, to_number: norm.e164, body: data.body, sent_by: context.userId,
    }).select("id").single();
    if (insErr || !row) {
      const { data: prev } = await supabaseAdmin.from("work_order_sms").select("status, error").eq("request_key", data.requestKey).maybeSingle();
      if (prev) return prev.status === "verzonden" ? { ok: true as const, duplicate: true } : { ok: false as const, error: prev.error ?? "Deze aanvraag is al in behandeling" };
      throw new Error("Kon de SMS niet registreren");
    }

    let status: "verzonden" | "mislukt" = "mislukt"; let sid: string | null = null; let err: string | null = null;
    try {
      const res = await fetch(`${GATEWAY}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env["LOVABLE_API_KEY"]}`,
          "X-Connection-Api-Key": process.env["TWILIO_API_KEY"]!,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: norm.e164, From: process.env["TWILIO_SMS_FROM"]!, Body: data.body }),
      });
      const text = await res.text();
      let j: any = null; try { j = JSON.parse(text); } catch { /* not json */ }
      if (res.ok && j?.sid) { status = "verzonden"; sid = j.sid; }
      else { err = `Twilio [${res.status}]: ${j?.message ?? text.slice(0, 300)}`; console.error(err); }
    } catch (e) { err = `Verbinding mislukt: ${(e as Error).message}`; }
    await supabaseAdmin.from("work_order_sms").update({ status, provider_message_id: sid, error: err, updated_at: new Date().toISOString() }).eq("id", row.id);
    return status === "verzonden" ? { ok: true as const, duplicate: false } : { ok: false as const, error: err ?? "Verzending mislukt" };
  });
