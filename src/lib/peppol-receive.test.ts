import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { receivePeppolInvoices } from './peppol-receive.server';

describe('receivePeppolInvoices', () => {
  it('slaat reeds ontvangen berichten over zonder een tweede factuur te maken', async () => {
    const insert = vi.fn();
    const db = { from: vi.fn(() => ({ insert, select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'existing' }, error: null }) }) }) })) };
    const call = vi.fn(async (path: string) => path.includes('/message/list')
      ? Response.json({ items: [{ id: 'received-1' }] }) : Response.json({}));
    const result = await receivePeppolInvoices(db as unknown as SupabaseClient<Database>, call);
    expect(result).toEqual({ imported: 0, skipped: 1, errors: [] });
    expect(insert).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledWith('/message/received-1/confirm', { method: 'PATCH' });
  });
  it('verandert geen facturen bij een lege inbox', async () => {
    const from = vi.fn();
    const call = vi.fn(async () => Response.json({ items: [] }));
    expect(await receivePeppolInvoices({ from } as unknown as SupabaseClient<Database>, call)).toEqual({ imported: 0, skipped: 0, errors: [] });
    expect(from).not.toHaveBeenCalled();
  });
});