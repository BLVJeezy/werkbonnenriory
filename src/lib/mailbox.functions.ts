import { isUrgentMail } from "./urgent-mail";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatAddress, formatSiteAddress } from "@/lib/address";
import { customerVatNumber, mentionsVrijBeroep, vatRateForCustomer } from "@/lib/vat-number";

export const MAILBOX_ADDRESS = "afspraak@riory.be";
const OUTLOOK_GATEWAY = "https://connector-gateway.lovable.dev";
const AI = "https://ai.gateway.lovable.dev/v1/responses";

type Recipient = { emailAddress?: { address?: string; name?: string } };
type GraphMessage = {
  id: string;
  subject?: string;
  receivedDateTime?: string;
  from?: Recipient;
  toRecipients?: Recipient[];
  ccRecipients?: Recipient[];
  body?: { content?: string };
};

type Extracted = {
  customer_name: string;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  site_street: string | null;
  site_house_number: string | null;
  site_postal_code: string | null;
  site_city: string | null;
  site_contact_name: string | null;
  site_contact_phone: string | null;
  phone: string | null;
  email: string | null;
  billing_email: string | null;
  vat_number: string | null;
  customer_type: "private" | "business" | "unknown";
  home_older_than_ten_years: boolean | null;
  project_name: string | null;
  description: string | null;
  urgent: boolean;
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["customer_name", "street", "house_number", "postal_code", "city", "site_street", "site_house_number", "site_postal_code", "site_city", "site_contact_name", "site_contact_phone", "phone", "email", "billing_email", "vat_number", "customer_type", "home_older_than_ten_years", "project_name", "description", "urgent"],
  properties: {
    customer_name: { type: "string" },
    street: { type: ["string", "null"] },
    house_number: { type: ["string", "null"] },
    postal_code: { type: ["string", "null"] },
    city: { type: ["string", "null"] },
    site_street: { type: ["string", "null"] },
    site_house_number: { type: ["string", "null"] },
    site_postal_code: { type: ["string", "null"] },
    site_city: { type: ["string", "null"] },
    site_contact_name: { type: ["string", "null"] },
    site_contact_phone: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    billing_email: { type: ["string", "null"] },
    vat_number: { type: ["string", "null"] },
    customer_type: { type: "string", enum: ["private", "business", "unknown"] },
    home_older_than_ten_years: { type: ["boolean", "null"] },
    project_name: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    urgent: { type: "boolean" },
  },
};

async function extractWithAI(apiKey: string, msg: GraphMessage): Promise<Extracted> {
  const text = `Onderwerp: ${msg.subject ?? ""}\nVan: ${msg.from?.emailAddress?.name ?? ""} <${msg.from?.emailAddress?.address ?? ""}>\n\n${(msg.body?.content ?? "").slice(0, 8000)}`;
  const res = await fetch(AI, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      instructions:
        "Je leest een afspraakaanvraag-mail van een klant. Haal de klantgegevens eruit: naam (persoon of bedrijf), klantadres opgesplitst in straat, huisnummer (incl. bus), postcode en plaats, en een eventueel apart werfadres in site_street, site_house_number, site_postal_code en site_city, telefoonnummer, e-mailadres en een korte omschrijving van het gevraagde werk in het Nederlands. Houd klantadres en werfadres strikt gescheiden als beide genoemd zijn. Als enkel een werfadres vermeld staat, zet het uitsluitend in de site-velden; als enkel een algemeen adres vermeld staat, gebruik de klantadresvelden. Haal ook de contactpersoon ter plaatse uit (site_contact_name en site_contact_phone), bv. huurder, bewoner, werfleider of conciërge; gebruik null als er geen aparte contactpersoon is. Vul de adres-site-velden alleen bij een expliciet werfadres, interventieadres of werkplek. Gebruik null als iets ontbreekt. Zet een apart e-mailadres voor facturatie (factuuradres, boekhouding) in billing_email, anders null. Gebruik het afzenderadres als e-mail als er geen ander staat.",
      input: text + "\n\nExtra extractieregel: lees het btw-nummer van de klant uit in vat_number (bijvoorbeeld BE 0123.456.789), indien expliciet aanwezig in de mail. Behoud de landcode en nummernotatie. Gebruik null als het ontbreekt. Gebruik nooit het btw-nummer van Riory uit een geciteerde afzenderhandtekening als klantnummer en verwar dit niet met het btw-percentage. Bepaal customer_type: private bij een duidelijk particuliere aanvraag voor de eigen woning, business bij een bedrijf of zakelijke aanvraag, anders unknown. Een ontbrekend btw-nummer op zichzelf bewijst niet dat iemand particulier is. Lees home_older_than_ten_years: true alleen als expliciet staat dat de woning ouder dan 10 jaar is (ook meer dan tien jaar of een expliciete leeftijd boven 10); false bij een expliciete leeftijd van 10 jaar of jonger; null als dit ontbreekt of onduidelijk is. Leid de leeftijd niet af uit het adres. Behoud de vermelde woningouderdom en het particuliere karakter ook in de omschrijving zodat de beheerder de btw-keuze kan controleren. Lees project_name: de naam van het project, de bouw of de site waarvoor de aanvraag is (bijvoorbeeld een projectnaam van een aannemer of architect), indien expliciet vermeld; anders null. Zet urgent altijd op false (wordt apart bepaald).",
      text: { format: { type: "json_schema", name: "klant", strict: true, schema } },
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`AI fout [${res.status}]: ${await res.text()}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const d = line.slice(5).trim();
      if (!d || d === "[DONE]") continue;
      try {
        const ev = JSON.parse(d);
        if (ev.type === "response.output_text.delta") out += ev.delta;
        if (ev.type === "error" || ev.type === "response.failed")
          throw new Error(`AI fout: ${JSON.stringify(ev).slice(0, 300)}`);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("AI fout")) throw e;
      }
    }
  }
  return JSON.parse(out) as Extracted;
}


export const importFromMailbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Alleen de beheerder kan afspraakmails ophalen.");
    const lovableKey = process.env['LOVABLE_API_KEY'];
    if (!lovableKey) throw new Error("Mailbox-koppeling ontbreekt");
    const { getConnectionKeyForUser } = await import("@/lib/appUserConnections.server");
    const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
    const { OUTLOOK_SCOPES } = await import("@/lib/outlook-scopes");
    const connectionAPIKey = await getConnectionKeyForUser(context.userId, "microsoft_outlook");
    if (!connectionAPIKey) throw new Error(`Koppel eerst de mailbox ${MAILBOX_ADDRESS} met de knop "Mailbox koppelen".`);

    const res = await callAsAppUser({
      gatewayBaseUrl: OUTLOOK_GATEWAY,
      connectionAPIKey,
      connectorId: "microsoft_outlook",
      path: "/me/mailFolders/inbox/messages?$top=50&$orderby=receivedDateTime desc&$select=id,subject,from,toRecipients,ccRecipients,receivedDateTime,body",
      init: { headers: { Prefer: 'outlook.body-content-type="text"' } },
      requiredScopes: OUTLOOK_SCOPES,
    });
    if (await appUserReconnectRequired(res)) throw new Error("De mailbox-koppeling is verlopen. Klik op \"Mailbox opnieuw koppelen\".");
    if (!res.ok) throw new Error(`Mailbox fout [${res.status}]: ${await res.text()}`);
    const json = (await res.json()) as { value: GraphMessage[] };
    // The connected mailbox is afspraak@riory.be itself, so every inbox mail counts.
    const candidates = json.value;
    if (candidates.length === 0) return { imported: 0, checked: json.value.length };

    const { data: existing } = await context.supabase
      .from("work_orders")
      .select("source_message_id")
      .in(
        "source_message_id",
        candidates.map((m) => m.id),
      );
    const seen = new Set((existing ?? []).map((e) => e.source_message_id));
    const fresh = candidates.filter((m) => !seen.has(m.id)).slice(0, 15);

    let imported = 0;
    const errors: string[] = [];
    for (const m of fresh) {
      try {
        const x = await extractWithAI(lovableKey, m);
        // Vrij beroep wordt letterlijk in de mail zelf gezocht; dat bepaalt de btw van deze taak.
        const vrij = mentionsVrijBeroep(`${m.subject ?? ""}\n${m.body?.content ?? ""}`);
        const { data: created, error } = await context.supabase.from("work_orders").insert({
          customer_name: x.customer_name || m.from?.emailAddress?.name || "Onbekend",
          street: x.street,
          house_number: x.house_number,
          postal_code: x.postal_code,
          city: x.city,
          address: formatAddress(x),
          use_site_address: !!formatSiteAddress(x),
          site_street: x.site_street,
          site_house_number: x.site_house_number,
          site_postal_code: x.site_postal_code,
          site_city: x.site_city,
          site_contact_name: x.site_contact_name,
          site_contact_phone: x.site_contact_phone,
          phone: x.phone,
          email: x.email ?? m.from?.emailAddress?.address ?? null,
          billing_email: x.billing_email,
          vat_number: customerVatNumber(x.vat_number),
          project_name: x.project_name,
          vat_rate: vatRateForCustomer(x.vat_number, 21, { customerType: x.customer_type, olderThanTenYears: x.home_older_than_ten_years }, { postalCode: x.postal_code, vrijBeroep: vrij }),
          description: x.description,
          urgent: isUrgentMail(m.subject, m.body?.content),
          source_message_id: m.id,
          source_mailbox_user_id: context.userId,
          source_subject: m.subject ?? null,
          received_at: m.receivedDateTime ?? null,
        }).select("customer_id").single();
        if (error) throw new Error(error.message);
        // Een mail die "vrij beroep" zegt, maakt de klant duurzaam vrij beroep; de beheerder kan het later nog corrigeren.
        // Klantgegevens meenemen: 6% (oude particuliere woning) bewaren bij de klant, of het bewaarde tarief toepassen.
        if (created?.customer_id && !vrij) {
          const fromMail = x.customer_type === "private" && x.home_older_than_ten_years === true;
          if (fromMail) {
            await context.supabase.from("customers").update({ default_vat_rate: 6 }).eq("id", created.customer_id);
          } else {
            const { data: k } = await context.supabase.from("customers").select("vat_number, postal_code, vrij_beroep, default_vat_rate").eq("id", created.customer_id).maybeSingle();
            if (k) {
              const rate = vatRateForCustomer(x.vat_number || k.vat_number, 21, undefined, { postalCode: x.postal_code || k.postal_code, vrijBeroep: !!k.vrij_beroep, defaultRate: k.default_vat_rate });
              if (rate !== 21) await context.supabase.from("work_orders").update({ vat_rate: rate }).eq("source_message_id", m.id);
            }
          }
        }
        if (vrij && created?.customer_id) {
          const { error: flagError } = await context.supabase.from("customers").update({ vrij_beroep: true }).eq("id", created.customer_id);
          if (flagError) console.error("Vrij beroep niet bewaard bij de klant:", flagError.message);
        }
        imported++;
      } catch (e) {
        console.error(e);
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    return { imported, checked: json.value.length, errors };
  });
