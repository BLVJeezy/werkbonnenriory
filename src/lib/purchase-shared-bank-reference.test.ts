import { PGlite } from '@electric-sql/pglite';
import { describe, expect, it } from 'vitest';

describe('Eén bankbetaling voor meerdere aankoopfacturen', () => {
  it('laat Hans Anders €249 en €39 aan dezelfde betaling van €288 koppelen', async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        CREATE TABLE public.purchase_invoices(id text PRIMARY KEY, total numeric, bank_transaction_key text);
        CREATE UNIQUE INDEX purchase_bank_transaction_unique ON public.purchase_invoices(bank_transaction_key) WHERE bank_transaction_key IS NOT NULL;
        CREATE TABLE public.ponto_reconciliations(transaction_key text PRIMARY KEY);
        CREATE TABLE public.fin_bank_allocations(transaction_id text, purchase_invoice_id text, amount numeric);
        CREATE UNIQUE INDEX allocation_purchase_unique ON public.fin_bank_allocations(transaction_id,purchase_invoice_id) WHERE purchase_invoice_id IS NOT NULL;
        INSERT INTO public.purchase_invoices VALUES ('hans-249',249,'bank-288'),('hans-39',39,NULL);
        INSERT INTO public.ponto_reconciliations VALUES ('bank-288');
        INSERT INTO public.fin_bank_allocations VALUES ('bank-288','hans-249',249);
      `);
      await db.query(`UPDATE public.purchase_invoices SET bank_transaction_key='bank-288' WHERE id='hans-39'`);
      await db.query(`INSERT INTO public.fin_bank_allocations VALUES ('bank-288','hans-39',39)`);
      expect((await db.query<{ total: string }>(`SELECT sum(amount)::text AS total FROM public.fin_bank_allocations WHERE transaction_id='bank-288'`)).rows[0]?.total).toBe('288');
      await expect(db.query(`INSERT INTO public.ponto_reconciliations VALUES ('bank-288')`)).rejects.toThrow('ponto_reconciliations_pkey');
      await expect(db.query(`INSERT INTO public.fin_bank_allocations VALUES ('bank-288','hans-39',39)`)).rejects.toThrow('allocation_purchase_unique');
    } finally { await db.close(); }
  });
});