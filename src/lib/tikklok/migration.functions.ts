import { createServerFn } from '@tanstack/react-start';
import { compare } from 'bcryptjs';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { assertAccountAdmin } from '@/lib/admin-accounts';
import { migrationPinSchema, migrationSections } from './migration-rules';

export const getTikklokMigrationStatus = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccountAdmin(context.supabase, context.userId);
    const counts = await Promise.all(migrationSections.map(async ([table, label, expected]) => {
      const { count, error } = await context.supabase.from(table).select('id', { count: 'exact', head: true });
      if (error) throw new Error('Overdrachtcontrole kon niet worden geladen');
      return { label, count: count ?? 0, expected };
    }));
    const { count: signed, error } = await context.supabase.from('tk_employment_contracts')
      .select('id', { count: 'exact', head: true }).not('employee_signature_image', 'is', null).not('employer_signature_image', 'is', null);
    if (error) throw new Error('Handtekeningen controleren mislukt');
    return { counts, signed: signed ?? 0, jobsEnabled: process.env['TIKKLOK_JOBS_ENABLED'] === 'true' };
  });

export const testMigratedPin = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => migrationPinSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAccountAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: employee, error } = await supabaseAdmin.from('tk_employees').select('pin').eq('id', data.employeeId).maybeSingle();
    if (error || !employee) throw new Error('Medewerker niet gevonden');
    return { matches: await compare(data.pin, employee.pin) };
  });

export const checkTikklokMailbox = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAccountAdmin(context.supabase, context.userId);
    const { tikklokMailbox } = await import('./mailbox.server');
    const { mailbox, correctSender } = await tikklokMailbox();
    return { mailbox, correctSender };
  });