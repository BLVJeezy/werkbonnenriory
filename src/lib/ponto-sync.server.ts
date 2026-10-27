import { decryptConnectionKey } from "./connectionKeyCrypto.server";
import { matchInvoice, type PontoTransaction } from "./ponto-match";

const API = "https://api.myponto.com";

type PontoCredentials = { clientId: string; clientSecret: string };

async function getCredentials(supabase: any): Promise<PontoCredentials | null> {
  const { data: s } = await supabase.from("settings").select("ponto_client_ciphertext").eq("id", 1).single();
  if (!s?.ponto_client_ciphertext) return null;
  const raw = decryptConnectionKey(s.ponto_client_ciphertext);
  const [clientId, clientSecret] = raw.split("\n");
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

async function accessToken(c: PontoCredentials): Promise<string> {
  const res = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", Authorization: `Basic ${btoa(`${c.clientId}:${c.clientSecret}`)}` },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Ponto-aanmelding mislukt [${res.status}]: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function pontoGet(token: string, path: string) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.api+json" } });
  if (!res.ok) throw new Error(`Ponto fout [${res.status}]: ${await res.text()}`);
  return res.json();
}

/** Ask Ponto to refresh the account's transactions, then read the most recent ones. */
async function recentTransactions(token: string, accountId: string): Promise<PontoTransaction[]> {
  await fetch(`${API}/synchronization`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/vnd.api+json", Accept: "application/vnd.api+json" },
    body: JSON.stringify({ data: { type: "synchronization", attributes: { subtype: "accountTransactions", resourceType: "account", resourceId: accountId } } }),
  }).catch(() => {});
  const json = await pontoGet(token, `/accounts/${accountId}/transactions?page%5Blimit%5D=100`);
  return (json.data ?? []).map((t: any) => ({
    amount: Number(t.attributes?.amount ?? 0),
    remittanceInformation: t.attributes?.remittanceInformation ?? null,
    executionDate: t.attributes?.executionDate ?? null,
    counterpartName: t.attributes?.counterpartName ?? null,
  }));
}

/** Fetches recent bank transactions via Ponto and marks matching open invoices as paid. */
export async function syncPontoPayments(supabase: any) {
  const creds = await getCredentials(supabase);
  if (!creds) throw new Error("Koppel eerst Ponto met je client ID en client secret");
  const token = await accessToken(creds);
  const accounts = await pontoGet(token, "/accounts");
  const accountIds = (accounts.data ?? []).map((a: any) => a.id as string);
  if (!accountIds.length) throw new Error("Geen bankrekeningen gekoppeld in Ponto");

  const { data: invoices } = await supabase.from("invoices").select("id, number, total, paid_amount").neq("kind", "creditnota");
  const open = (invoices ?? [])
    .map((i: any) => ({ id: i.id as string, number: i.number as string, total: Number(i.total), paidAmount: Number(i.paid_amount) }))
    .filter((i) => i.total > 0 && i.paidAmount + 0.005 < i.total);
  if (!open.length) return { checked: 0, matched: [] as string[] };

  const matched: string[] = [];
  for (const accountId of accountIds) {
    const txs = await recentTransactions(token, accountId);
    for (const tx of txs) {
      const inv = matchInvoice(tx, open.filter((o: { number: string }) => !matched.includes(o.number)));
      if (!inv) continue;
      const { error } = await supabase.from("invoices").update({ paid_amount: inv.total, paid_at: tx.executionDate ?? new Date().toISOString() }).eq("id", inv.id);
      if (error) throw new Error(error.message);
      matched.push(inv.number);
    }
  }
  await supabase.from("settings").update({ ponto_last_sync: new Date().toISOString() }).eq("id", 1);
  return { checked: open.length, matched };
}
