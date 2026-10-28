import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
export const documentReport = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(i => z.object({ id: z.string().uuid(), type: z.enum(['factuur','creditnota','offerte','werkbon']) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (roleError || !admin) throw new Error('Alleen voor beheerder.');
    const types = data.type === 'factuur' ? ['factuur','herinnering'] : [data.type];
    const { data: rows, error } = await context.supabase.from('document_deliveries')
      .select('id,label,recipient,status,created_at,sent_at,expires_at,document_open_events(opened_at)')
      .eq('document_id', data.id).in('document_type', types).order('created_at', { ascending: false });
    if (error) throw new Error('Documentverslag ophalen mislukt.');
    return rows ?? [];
  });