import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatAddress } from "@/lib/address";

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
  phone: string | null;
  email: string | null;
  description: string | null;
};

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["customer_name", "street", "house_number", "postal_code", "city", "phone", "email", "description"],
  properties: {
    customer_name: { type: "string" },
    street: { type: ["string", "null"] },
    house_number: { type: ["string", "null"] },
    postal_code: { type: ["string", "null"] },
    city: { type: ["string", "null"] },
    phone: { type: ["string", "null"] },
    email: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
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
        "Je leest een afspraakaanvraag-mail van een klant. Haal de klantgegevens eruit: naam (persoon of bedrijf), adres van de werkplek opgesplitst in straat, huisnummer (incl. bus), postcode en plaats, telefoonnummer, e-mailadres en een korte omschrijving van het gevraagde werk in het Nederlands. Gebruik null als iets ontbreekt. Gebruik het afzenderadres als e-mail als er geen ander staat.",
      input: text,
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
        const { error } = await context.supabase.from("work_orders").insert({
          customer_name: x.customer_name || m.from?.emailAddress?.name || "Onbekend",
          street: x.street,
          house_number: x.house_number,
          postal_code: x.postal_code,
          city: x.city,
          address: formatAddress(x),
          phone: x.phone,
          email: x.email ?? m.from?.emailAddress?.address ?? null,
          description: x.description,
          source_message_id: m.id,
          source_subject: m.subject ?? null,
          received_at: m.receivedDateTime ?? null,
        });
        if (error) throw new Error(error.message);
        imported++;
      } catch (e) {
        console.error(e);
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    return { imported, checked: json.value.length, errors };
  });
