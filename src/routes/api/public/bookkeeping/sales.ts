import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { tokenHash } from '@/lib/document-tracking';
export const Route = createFileRoute('/api/public/bookkeeping/sales')({ server: { handlers: {
  POST: async ({ request }) => {
    const secret = process.env['MAILTAKEN_SALES_SYNC_TOKEN'];
    if (!secret) return Response.json({ error: 'Boekhoudkoppeling nog niet ingesteld.' }, { status: 503 });
    const supplied = request.headers.get('Authorization')?.replace(/^Bearer /,'') ?? '';
    if (!supplied || await tokenHash(supplied) !== await tokenHash(secret)) return Response.json({ error: 'Geen toegang.' }, { status: 401 });
    let input;
    try { input = z.object({ offset: z.number().int().min(0).max(1000000).default(0), limit: z.number().int().min(1).max(100).default(100) }).parse(await request.json()); }
    catch { return Response.json({ error: 'Ongeldige aanvraag.' }, { status: 400 }); }
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: rows, error } = await supabaseAdmin.from('invoices').select('id,number,kind,credit_for,issue_date,due_date,customer,lines,vat_rate,net,vat,total,paid_amount,paid_at,status,created_at').order('created_at').order('id').range(input.offset,input.offset+input.limit-1);
    if (error) return Response.json({ error: 'Facturen ophalen mislukt.' }, { status: 500 });
    return Response.json({ version: 1, source: 'riory-werkbonnen', invoices: rows ?? [], nextOffset: rows?.length === input.limit ? input.offset + input.limit : null }, { headers: { 'Cache-Control': 'private, no-store' } });
  },
} } });