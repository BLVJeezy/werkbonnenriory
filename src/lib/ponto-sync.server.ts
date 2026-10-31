import { decryptConnectionKey } from "./connectionKeyCrypto.server";
import { matchInvoice, type PontoTransaction } from "./ponto-match";
import { matchPurchasePayment } from './purchase-payment';
import { storePontoTransactions } from './ponto-store';

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
async function recentTransactions(token: string, accountId: string): Promise<(PontoTransaction & { key: string })[]> {
  await fetch(`${API}/synchronization`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/vnd.api+json", Accept: "application/vnd.api+json" },
    body: JSON.stringify({ data: { type: "synchronization", attributes: { subtype: "accountTransactions", resourceType: "account", resourceId: accountId } } }),
  }).catch(() => {});
  let path: string | null = `/accounts/${encodeURIComponent(accountId)}/transactions?page%5Blimit%5D=100`;
  const transactions: (PontoTransaction & { key: string })[] = [];
  const seen = new Set<string>();
  while (path && !seen.has(path)) {
    seen.add(path);
    const json = await pontoGet(token, path);
    transactions.push(...(json.data ?? []).filter((t: any) => typeof t.id === 'string').map((t: any) => ({
    key: `${accountId}:${t.id}`,
    amount: Number(t.attributes?.amount ?? 0),
    remittanceInformation: t.attributes?.remittanceInformation ?? null,
    executionDate: t.attributes?.executionDate ?? null,
    counterpartName: t.attributes?.counterpartName ?? null,
    })));
    const next = json.links?.next;
    const nextUrl = typeof next === 'string' ? new URL(next, API) : null;
    path = nextUrl?.origin === API ? nextUrl.pathname + nextUrl.search : null;
  }
  return transactions;
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
    .filter((i: { total: number; paidAmount: number }) => i.total > 0 && i.paidAmount + 0.005 < i.total);
  const { data: purchases, error: purchaseError } = await supabase.from('purchase_invoices').select('id,invoice_number,payment_ref,total,kind,status').in('status', ['goedgekeurd','betaling_klaargezet']);
  if (purchaseError) throw new Error(purchaseError.message);
  const payable = (purchases ?? []).map((r: any) => ({ ...r, total: Number(r.total) }));
  const { data: used, error: usedError } = await supabase.from('ponto_reconciliations').select('transaction_key');
  if (usedError) throw new Error(usedError.message);
  const usedKeys = new Set((used ?? []).map((r: any) => r.transaction_key));
  const purchaseMatched: string[] = [];

  const matched: string[] = [];
  for (const accountId of accountIds) {
    const txs = await recentTransactions(token, accountId);
    if (txs.length) {
      await storePontoTransactions(supabase,
        txs.map((tx) => ({ transaction_key: tx.key, account_id: accountId, amount: tx.amount, remittance: tx.remittanceInformation, counterpart_name: tx.counterpartName, execution_date: tx.executionDate ? tx.executionDate.slice(0, 10) : null })),
      );
    }
    for (const tx of txs) {
      if (usedKeys.has(tx.key)) continue;
      const purchase = matchPurchasePayment(tx, payable);
      const inv = matchInvoice(tx, open.filter((o: { number: string }) => !matched.includes(o.number)));
      // Ambiguity across customer receipts and supplier refunds must not reconcile either.
      if (purchase && inv) continue;
      if (purchase) {
        const { data: applied, error } = await supabase.rpc('reconcile_purchase_payment', { p_id: purchase.id, p_key: tx.key, p_amount: tx.amount, p_ref: tx.remittanceInformation, p_date: tx.executionDate ?? new Date().toISOString() });
        if (error) throw new Error(error.message);
        if (applied) { purchaseMatched.push(purchase.invoice_number ?? purchase.id); purchase.status = 'betaald'; usedKeys.add(tx.key); }
        continue;
      }
      if (!inv) continue;
      const { data: applied, error } = await supabase.rpc('reconcile_sales_payment', { p_id: inv.id, p_key: tx.key, p_amount: tx.amount, p_ref: tx.remittanceInformation, p_date: tx.executionDate ?? new Date().toISOString() });
      if (error) throw new Error(error.message);
      if (applied) { matched.push(inv.number); usedKeys.add(tx.key); }
    }
  }
  await supabase.from("settings").update({ ponto_last_sync: new Date().toISOString() }).eq("id", 1);
  return { checked: open.length + payable.length, matched, purchaseMatched };
}
