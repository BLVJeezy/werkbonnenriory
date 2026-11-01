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
export async function financePontoSync(db: any, userId: string, input: { companyId: string; bankAccount: string; since: string }) {
  const key = await token(db);
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
      const rows = (result.data ?? []).filter((t: any) => String(t.attributes?.executionDate ?? t.attributes?.valueDate ?? "").slice(0, 10) >= input.since).map((t: any) => ({ user_id: userId, company_id: input.companyId, bank_account: bankAccount, tx_date: String(t.attributes?.executionDate ?? t.attributes?.valueDate).slice(0, 10), amount: Number(t.attributes?.amount), counterparty: t.attributes?.counterpartName ?? null, counterparty_account: t.attributes?.counterpartReference ?? null, description: [t.attributes?.remittanceInformation, t.attributes?.description, account.attributes?.reference].filter(Boolean).join(" · ").slice(0, 1000), dedupe_key: `ponto:${account.id}:${t.id}` }));
      fetched += rows.length;
      if (rows.length) {
        const { data, error } = await db.from("fin_bank_tx").upsert(rows, { onConflict: "company_id,dedupe_key", ignoreDuplicates: true }).select("id");
        if (error) throw new Error("Opslaan bankverrichtingen mislukt");
        inserted += data?.length ?? 0;
      }
      path = result.links?.next ?? null;
    }
  }
  return { accounts: accounts.length, fetched, inserted };
}