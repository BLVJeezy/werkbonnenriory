import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { companyDetails, companyNumber } from "./company-lookup";

export const lookupCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ number: z.string().trim().min(1).max(30) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (error || !admin) throw new Error("Alleen voor beheerder");
    const number = companyNumber(data.number);
    if (!number) return { ok: false as const, message: "Vul een Belgisch ondernemingsnummer of een BE-/NL-btw-nummer in." };
    try {
      const response = await fetch("https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(number),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) return { ok: false as const, message: "De officiële btw-dienst is tijdelijk niet beschikbaar. Probeer opnieuw." };
      const payload: Record<string, unknown> = await response.json();
      if (payload["actionSucceed"] === false || payload["valid"] === undefined) return { ok: false as const, message: "De officiële btw-dienst is tijdelijk bezet. Probeer opnieuw." };
      if (payload["valid"] !== true) return { ok: false as const, message: "Geen actief btw-nummer gevonden. Niet-btw-plichtige ondernemingen en VME’s kun je handmatig invullen." };
      const details = companyDetails(payload);
      if (!details.name && !details.street) return { ok: false as const, message: "Btw-nummer geldig, maar de officiële dienst geeft geen naam of adres vrij." };
      return { ok: true as const, details };
    } catch {
      return { ok: false as const, message: "De officiële btw-dienst antwoordt niet. Probeer opnieuw of vul de gegevens zelf in." };
    }
  });