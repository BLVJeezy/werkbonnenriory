import { decryptConnectionKey } from "@/lib/connectionKeyCrypto.server";

const API = "https://api.myponto.com";
async function token(db: any) {
  const { data, error } = await db.from("settings").select("ponto_client_ciphertext").eq("id", 1).single();
  if (error || !data?.ponto_client_ciphertext) throw new Error("Koppel Ponto eerst bij Facturen");
  const [id, secret] = decryptConnectionKey(data.ponto_client_ciphertext).split("\n");
  if (!id || !secret) throw new Error("Ponto-koppeling onvolledig");
  const response = await fetch(`${API}/oauth2/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", Authorization: `Basic ${btoa(`${id}:${secret}`)}` }, body: "grant_type=client_credentials" });
  if (!response.ok) throw new Error("Aanmelden bij Ponto mislukt");
  return (await response.json() as { access_token: string }).access_token;
}
async function get(key: string, path: string) {
  const url = new URL(path, API);
  if (url.origin !== API) throw new Error("Ongeldige Ponto-vervolgpagina");
  const response = await fetch(url, { headers: { Accept: "application/vnd.api+json", Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new Error("Ponto tijdelijk niet bereikbaar");
  return response.json() as Promise<any>;
}
export async function financePontoAccounts(db: any) {
  const key = await token(db);
  const result = await get(key, "/accounts?page[limit]=100");
  return (result.data ?? []).map((a: any) => ({ id: String(a.id), iban: String(a.attributes?.reference ?? ""), description: String(a.attributes?.description ?? ""), balance: Number(a.attributes?.currentBalance ?? 0), currency: String(a.attributes?.currency ?? "EUR"), synchronizedAt: a.meta?.synchronizedAt ?? null }));
}
/** Ponto toont alleen zijn eigen cache; vraag de bank expliciet om verse gegevens en wacht kort op het resultaat. */
async function refreshFromBank(key: string, accountIds: string[]) {
  const warnings: string[] = [];
  const started: string[] = [];
  for (const id of accountIds) for (const subtype of ["accountDetails", "accountTransactions"]) {
    const response = await fetch(`${API}/synchronizations`, { method: "POST", headers: { "Content-Type": "application/vnd.api+json", Accept: "application/vnd.api+json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ data: { type: "synchronization", attributes: { resourceType: "account", resourceId: id, subtype } } }) });
    const body = await response.json().catch(() => ({})) as any;
    if (response.ok && body?.data?.id) { started.push(String(body.data.id)); continue; }
    const code = String(body?.errors?.[0]?.code ?? response.status);
    warnings.push(code === "accountRecentlySynchronized" ? "De bank werd net nog bijgewerkt; Ponto laat een nieuwe opvraging pas na enkele minuten toe." : code === "authorizationExpired" || code === "accountAuthorizationExpired" ? "De bankmachtiging in Ponto is verlopen: vernieuw ze in Ponto." : `Ponto kon de bank niet bijwerken (${code}).`);
  }
  const deadline = Date.now() + 25000;
  const pending = new Set(started);
  while (pending.size && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    for (const id of [...pending]) {
      const response = await fetch(`${API}/synchronizations/${encodeURIComponent(id)}`, { headers: { Accept: "application/vnd.api+json", Authorization: `Bearer ${key}` } });
      const status = String(((await response.json().catch(() => ({}))) as any)?.data?.attributes?.status ?? "");
      if (status === "success") pending.delete(id);
      else if (status === "error") { pending.delete(id); warnings.push("De bank gaf een fout bij het bijwerken; probeer later opnieuw of vernieuw de machtiging in Ponto."); }
    }
  }
  if (pending.size) warnings.push("De bank is nog bezig; druk binnen een minuut opnieuw op ophalen.");
  return [...new Set(warnings)];
}

export async function financePontoSync(db: any, userId: string, input: { companyId: string; bankAccount: string; since: string }) {
  const key = await token(db);
  const initial = (await get(key, "/accounts?page[limit]=100")).data ?? [];
  const warnings = await refreshFromBank(key, initial.map((a: any) => String(a.id)));
  const accounts = (await get(key, "/accounts?page[limit]=100")).data ?? [];
  // Koppel elke bankrekening via haar IBAN aan de juiste grootboekrekening (bv. 550200, 550400).
  const { data: ledger } = await db.from("fin_accounts").select("number, name").eq("company_id", input.companyId).like("number", "55%");
  const normIban = (s: string) => s.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const ledgerByIban = new Map<string, string>();
  for (const a of ledger ?? []) {
    const m = String(a.name ?? "").match(/[A-Z]{2}\d{2}[\dA-Z ]{8,30}/i);
    if (m) ledgerByIban.set(normIban(m[0]), String(a.number));
  }
  let fetched = 0, inserted = 0;
  for (const account of accounts) {
    const bankAccount = ledgerByIban.get(normIban(String(account.attributes?.reference ?? ""))) ?? input.bankAccount;
    let path: string | null = `/accounts/${encodeURIComponent(account.id)}/transactions?page[limit]=100`;
    const seen = new Set<string>();
    while (path && !seen.has(path)) {
      seen.add(path);
      const result = await get(key, path);
      const rows = (result.data ?? []).filter((t: any) => Number(t.attributes?.amount) !== 0 && String(t.attributes?.executionDate ?? t.attributes?.valueDate ?? "").slice(0, 10) >= input.since).map((t: any) => ({ user_id: userId, company_id: input.companyId, bank_account: bankAccount, tx_date: String(t.attributes?.executionDate ?? t.attributes?.valueDate).slice(0, 10), amount: Number(t.attributes?.amount), counterparty: t.attributes?.counterpartName ?? null, counterparty_account: t.attributes?.counterpartReference ?? null, description: [t.attributes?.remittanceInformation, t.attributes?.description, account.attributes?.reference].filter(Boolean).join(" · ").slice(0, 1000), dedupe_key: `ponto:${account.id}:${t.id}` }));
      fetched += rows.length;
      if (rows.length) {
        const { data, error } = await db.from("fin_bank_tx").upsert(rows, { onConflict: "company_id,dedupe_key", ignoreDuplicates: true }).select("id");
        if (error) throw new Error("Opslaan bankverrichtingen mislukt");
        inserted += data?.length ?? 0;
      }
      path = result.links?.next ?? null;
    }
  }
  return { accounts: accounts.length, fetched, inserted, warnings };
}