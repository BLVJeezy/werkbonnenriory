import { createFileRoute } from '@tanstack/react-router';
import { tokenHash } from '@/lib/document-tracking';

// 1x1 transparent GIF
const GIF = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), c => c.charCodeAt(0));
const gif = () => new Response(GIF, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, private', Pragma: 'no-cache' } });

/** Mail-open pixel: registers an opening for a known delivery token; always returns the pixel, never data. */
export const Route = createFileRoute('/api/public/mail-open/$token')({
  server: { handlers: {
    GET: async ({ params }) => {
      const token = params.token.replace(/\.gif$/, '');
      if (!/^[a-f0-9-]{72}$/.test(token)) return gif();
      try {
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const { data: row } = await supabaseAdmin.from('document_deliveries').select('id,status').eq('token_hash', await tokenHash(token)).maybeSingle();
        if (row && (row.status === 'accepted' || row.status === 'uncertain')) {
          await supabaseAdmin.from('document_open_events').insert({ delivery_id: row.id, source: 'mail' });
        }
      } catch (e) { console.error('Mailopening registreren mislukt', e); }
      return gif();
    },
  } },
});
