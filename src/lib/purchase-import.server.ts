import { normalizePurchaseInvoice } from "./purchase-invoice";
import { assertInvoiceMailbox } from './mail-senders';
import { peppolBeforeMail, purchaseAttachment } from './purchase-mail-policy';

const GATEWAY = "https://connector-gateway.lovable.dev";
const AI = "https://ai.gateway.lovable.dev/v1/responses";
const FOLDER_NAME = "Aankoopfacturen";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["supplierName", "supplierVat", "supplierIban", "supplierBic", "invoiceNumber", "invoiceDate", "dueDate", "lines", "net", "vat", "total", "paymentRef"],
  properties: {
    supplierName: { type: ["string", "null"] },
    supplierVat: { type: ["string", "null"] },
    supplierIban: { type: ["string", "null"] },
    supplierBic: { type: ["string", "null"] },
    invoiceNumber: { type: ["string", "null"] },
    invoiceDate: { type: ["string", "null"] },
    dueDate: { type: ["string", "null"] },
    lines: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["description", "quantity", "unit", "unitPrice", "amount", "vatRate", "net", "vat", "total", "discountPercent", "discountAmount"],
        properties: {
          description: { type: "string" }, quantity: { type: ["number", "null"] }, unit: { type: ["string", "null"] },
          unitPrice: { type: ["number", "null"] }, amount: { type: ["number", "null"] },
          vatRate: { type: ["number", "null"] }, net: { type: ["number", "null"] }, vat: { type: ["number", "null"] }, total: { type: ["number", "null"] },
          discountPercent: { type: ["number", "null"] }, discountAmount: { type: ["number", "null"] },
        },
      },
    },
    net: { type: ["number", "null"] },
    vat: { type: ["number", "null"] },
    total: { type: ["number", "null"] },
    paymentRef: { type: ["string", "null"] },
  },
};

async function extractWithAI(apiKey: string, pdfText: string, subject: string): Promise<unknown> {
  const res = await fetch(AI, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      stream: true,
      store: false,
      reasoning: { effort: "low" },
      instructions:
        "Je leest de tekst van een aankoopfactuur (PDF) van een leverancier. Haal eruit: leveranciersnaam, btw-nummer, IBAN (supplierIban) en gedrukte BIC/SWIFT-code (supplierBic) van de leverancier, ook onderaan bij betaalinstructies. Leid de BIC niet zelf af; ontbrekende bankgegevens zijn null. Vervolgens: factuurnummer, factuurdatum en vervaldag (YYYY-MM-DD), elke factuurlijn met omschrijving, aantal, eenheid, prijs per stuk (unitPrice), btw-tarief in procent (vatRate), bedrag exclusief btw (net of amount), btw-bedrag (vat) en bedrag inclusief btw (total), het totaal excl. btw van het document (net), het btw-bedrag (vat), het totaal incl. btw (total) en de gestructureerde mededeling of betaalreferentie (paymentRef, bv. +++123/4567/89074+++). Getallen als getallen (punt als decimaalteken). Gebruik null als iets ontbreekt. Verwar het btw-nummer of IBAN van de klant (Riory) nooit met dat van de leverancier.",
      input: `Lees ook kortingen per lijn: discountPercent en discountAmount (totale lijnkorting exclusief btw). net/amount, vat en total zijn NA korting, niet dubbel aftrekken. Ontbrekende kortingvelden zijn null. Algemene documentkortingen die niet in de productlijnen zitten: afzonderlijke negatieve lijn Korting, aantal 1, met toepasselijk btw-tarief (splits per tarief). Voorwaardelijke betalingskortingen niet aftrekken; vermeld de voorwaarde in de omschrijving. Behoud de gedrukte documenttotalen.\nOnderwerp mail: ${subject}\n\nFactuurtekst:\n${pdfText.slice(0, 15000)}`,
      text: { format: { type: "json_schema", name: "aankoopfactuur", strict: true, schema } },
    }),
  });
  if (!res.ok || !res.body) throw new Error(`AI fout [${res.status}]: ${await res.text()}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", out = "";
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
        if (ev.type === "error" || ev.type === "response.failed") throw new Error(`AI fout: ${JSON.stringify(ev).slice(0, 300)}`);
      } catch (e) { if (e instanceof Error && e.message.startsWith("AI fout")) throw e; }
    }
  }
  return JSON.parse(out);
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText } = await import("unpdf");
  const { text } = await extractText(bytes.slice(), { mergePages: true });
  return text;
}

type Graph = (path: string, init?: RequestInit) => Promise<Response>;

/** Peppol first, then missing documents from the verified accounting mailbox. */
export async function importPurchaseInvoicesFromMail(supabase: any, connectionKey: string, lovableKey: string) {
  const { receivePeppolInvoices } = await import('./peppol-receive.server');
  return peppolBeforeMail(() => receivePeppolInvoices(supabase), () => readPurchaseMail(supabase, connectionKey, lovableKey));
}

async function readPurchaseMail(supabase: any, connectionKey: string, lovableKey: string) {
  const { callAsAppUser, appUserReconnectRequired } = await import("@/integrations/lovable/appUserConnector");
  const { WERKBON_MAIL_SCOPES } = await import("@/lib/outlook-scopes");
  const graph: Graph = (path, init) =>
    callAsAppUser({ gatewayBaseUrl: GATEWAY, connectionAPIKey: connectionKey, connectorId: "microsoft_outlook", path, init: { ...init, headers: { ...init?.headers, Prefer: 'IdType="ImmutableId"' } }, requiredScopes: WERKBON_MAIL_SCOPES });

  const profile = await graph('/me?$select=mail,userPrincipalName');
  if (!profile.ok) throw new Error(`Mailbox controleren mislukt [${profile.status}]: ${await profile.text()}`);
  assertInvoiceMailbox(await profile.json());

  // Find (or create) the folder
  const folders = await graph(`/me/mailFolders?$filter=displayName eq '${FOLDER_NAME}'&$select=id,displayName`);
  if (await appUserReconnectRequired(folders)) throw new Error("De mailbox boekhouding@riory.be moet opnieuw gekoppeld worden");
  if (!folders.ok) throw new Error(`Mailbox fout [${folders.status}]: ${await folders.text()}`);
  let folderId = ((await folders.json()).value ?? [])[0]?.id as string | undefined;
  if (!folderId) {
    const created = await graph("/me/mailFolders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: FOLDER_NAME }) });
    if (!created.ok) throw new Error(`Map aanmaken mislukt [${created.status}]: ${await created.text()}`);
    folderId = (await created.json()).id;
  }

  let imported = 0, skipped = 0;
  const errors: string[] = [];
  let attempted = 0;
  for (const folder of ['inbox', folderId]) {
  let next: string | null = `/me/mailFolders/${folder}/messages?$top=50&$orderby=receivedDateTime desc&$select=id,subject,receivedDateTime,hasAttachments`;
  while (next && attempted < 15) {
  const msgs = await graph(next);
  if (!msgs.ok) throw new Error(`Mailbox fout [${msgs.status}]: ${await msgs.text()}`);
  const page = await msgs.json();
  const messages = (page.value ?? []) as { id: string; subject?: string; hasAttachments?: boolean }[];
  const nextLink = page['@odata.nextLink'] as string | undefined;
  next = nextLink ? nextLink.replace('https://graph.microsoft.com/v1.0', '') : null;
  for (const m of messages) {
    if (!m.hasAttachments) continue;
    const atts = await graph(`/me/messages/${encodeURIComponent(m.id)}/attachments?$select=id,name,contentType,size,isInline`);
    if (!atts.ok) { errors.push(`${m.subject ?? m.id}: bijlagen lezen mislukt`); continue; }
    const pdfs = ((await atts.json()).value ?? []).filter(purchaseAttachment);
    if (!pdfs.length) { skipped++; continue; }
    for (const a of pdfs) {
      if (attempted >= 15) break;
      const attachmentKey = `boekhouding:${m.id}:${a.id}`;
      try {
        const { data: done, error: doneError } = await supabase.from('purchase_mail_imports').select('attachment_key').eq('attachment_key', attachmentKey).maybeSingle();
        if (doneError) throw new Error(doneError.message);
        if (done) { skipped++; continue; }
        attempted++;
        if (a.size > 10000000) throw new Error('Bijlage groter dan 10 MB');
        const full = await graph(`/me/messages/${encodeURIComponent(m.id)}/attachments/${encodeURIComponent(a.id)}`);
        if (!full.ok) throw new Error(`bijlage downloaden mislukt [${full.status}]`);
        const contentBytes = (await full.json()).contentBytes as string;
        const bytes = Uint8Array.from(atob(contentBytes), (c) => c.charCodeAt(0));
        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
        const { data: same, error: hashError } = await supabase.from('purchase_invoices').select('id').eq('upload_hash', hash).maybeSingle();
        if (hashError) throw new Error(hashError.message);
        if (same) {
          const { error } = await supabase.from('purchase_mail_imports').upsert({ attachment_key: attachmentKey, purchase_invoice_id: same.id }, { onConflict: 'attachment_key', ignoreDuplicates: true });
          if (error) throw new Error(error.message);
          skipped++; continue;
        }
        const mime = a.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : a.contentType || 'image/jpeg';
        const text = mime === 'application/pdf' ? await pdfText(bytes).catch(() => '') : '';
        const { extractReceipt } = await import('./receipt.server');
        const parsed = text.trim().length >= 20
          ? normalizePurchaseInvoice(await extractWithAI(lovableKey, text, m.subject ?? ''))
          : await extractReceipt(lovableKey, contentBytes, mime);
        const path = `mail/${crypto.randomUUID()}.${mime === 'application/pdf' ? 'pdf' : mime.split('/')[1]}`;
        const { error: upErr } = await supabase.storage.from("aankoopfacturen").upload(path, bytes, { contentType: mime });
        if (upErr) throw new Error(`PDF opslaan mislukt: ${upErr.message}`);
        const { data: result, error: insErr } = await supabase.rpc('ingest_purchase_document', { p_attachment_key: attachmentKey, p_document: {
          supplier_name: parsed.supplierName, supplier_vat: parsed.supplierVat, supplier_iban: parsed.supplierIban, supplier_bic: parsed.supplierBic,
          invoice_number: parsed.invoiceNumber, invoice_date: parsed.invoiceDate, due_date: parsed.dueDate,
          lines: parsed.lines, net: parsed.net, vat: parsed.vat, total: parsed.total, payment_ref: parsed.paymentRef,
          source: "mail", pdf_path: path, email_message_id: m.id, upload_hash: hash, kind: parsed.total < 0 ? 'creditnota' : 'factuur',
        } });
        if (insErr || result?.action === 'skipped') await supabase.storage.from('aankoopfacturen').remove([path]);
        if (insErr) throw new Error(insErr.message);
        if (result?.action === 'skipped') skipped++; else imported++;
      } catch (e) {
        errors.push(`${m.subject ?? "mail"}: ${e instanceof Error ? e.message : "fout"}`);
      }
    }
  }
  }
  }
  return { imported, skipped, errors };
}
