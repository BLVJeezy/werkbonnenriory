import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { werkbonMailData } from './werkbon-mail';
import { visibleWerkbonPreview } from './werkbon-preview';
import { totalSeconds } from './time';

export const previewWerkbonPdf = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ workOrderId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roles, error: roleError } = await supabase.from('user_roles').select('role').eq('user_id', userId);
    if (roleError) throw new Error('Toegang kon niet gecontroleerd worden');
    const admin = roles?.some(r => r.role === 'admin');
    if (!admin && !roles?.some(r => r.role === 'technician')) throw new Error('Geen toegang tot werkbonnen');
    const { data: wo, error } = await supabase.from('work_orders').select('*').eq('id', data.workOrderId).single();
    if (error || !wo) throw new Error('Werkbon niet gevonden of geen toegang');
    let permissions = { showContact: true, showPrices: true };
    if (!admin) {
      const { data: crew, error: crewError } = await supabase.from('technicians').select('id, show_contact, show_prices').eq('user_id', userId).maybeSingle();
      if (crewError || !crew || wo.technician_id !== crew.id) throw new Error('Geen toegang tot deze werkbon');
      permissions = { showContact: !!crew.show_contact, showPrices: !!crew.show_prices };
    }
    const [times, materials, activity] = await Promise.all([
      supabase.from('time_entries').select('started_at, ended_at').eq('work_order_id', wo.id),
      supabase.from('materials').select('name, quantity, unit').eq('work_order_id', wo.id).order('created_at'),
      wo.activity_id ? supabase.from('activities').select('name').eq('id', wo.activity_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (times.error || materials.error || activity.error) throw new Error('Werkbongegevens konden niet geladen worden');
    const dto = visibleWerkbonPreview(werkbonMailData({ ...wo, distance_km: wo.distance_km == null ? null : Number(wo.distance_km), paid_amount: wo.paid_amount == null ? null : Number(wo.paid_amount) }, activity.data?.name ?? null, totalSeconds(times.data ?? [], Date.now()),
      (materials.data ?? []).map(m => ({ name: m.name, quantity: Number(m.quantity), unit: m.unit }))), permissions);
    const { createWerkbonPdf } = await import('./werkbon-pdf');
    const { loadWerkbonPhotos } = await import('./werkbon-photos.server');
    const pdf = await createWerkbonPdf(dto, await loadWerkbonPhotos(supabase, wo.id));
    // Return bytes directly: photo PDFs exceed the server-function JSON output limit.
    return new Response(new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), {
      headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'private, no-store', 'X-Werkbon-Number': String(wo.number ?? '') },
    });
  });