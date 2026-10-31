import { expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { storePontoTransactions } from './ponto-store';

it('uses insert-only conflict handling so repeated Ponto checks never update immutable transactions', async () => {
  const stored = new Map<string, number>();
  const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const insertOnly = headers.get('Prefer')?.includes('resolution=ignore-duplicates');
    const rows = JSON.parse(String(init?.body)) as { transaction_key: string; amount: number }[];
    for (const row of rows) {
      if (stored.has(row.transaction_key) && !insertOnly) return new Response(JSON.stringify({ message: 'RLS update denied' }), { status: 403 });
      if (!stored.has(row.transaction_key)) stored.set(row.transaction_key, row.amount);
    }
    return new Response(null, { status: 201 });
  });
  const client = createClient<Database>('https://bank-test.example', 'test-key', { auth: { persistSession: false }, global: { fetch: fetcher } });
  await storePontoTransactions(client, [{ transaction_key: 'account:transaction', account_id: 'account', amount: 121 }]);
  await storePontoTransactions(client, [{ transaction_key: 'account:transaction', account_id: 'account', amount: 999 }]);
  expect(stored.get('account:transaction')).toBe(121);
  expect(fetcher).toHaveBeenCalledTimes(2);
});