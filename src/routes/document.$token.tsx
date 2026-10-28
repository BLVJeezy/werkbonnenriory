import { createFileRoute } from '@tanstack/react-router';
import { mayOpenDocument, tokenHash } from '@/lib/document-tracking';

export const Route = createFileRoute('/document/$token')({
  head: () => ({ meta: [{ title: 'Document openen — Riory' }, { name: 'description', content: 'Uw beveiligde Riory-document openen.' }, { property: 'og:title', content: 'Document openen — Riory' }, { property: 'og:description', content: 'Uw beveiligde Riory-document openen.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex,nofollow' }] }),
  server: { handlers: {
    GET: async () => new Response(`<!doctype html><html lang="nl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Document openen — Riory</title><body><main><h1>Riory · Document</h1><p>Bij het openen wordt het tijdstip geregistreerd voor documentopvolging. Er worden geen cookies, IP-adressen of apparaatgegevens bewaard.</p><form method="post"><button type="submit">Document openen</button></form><p>Bewaar deze persoonlijke link zorgvuldig.</p></main></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow', 'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'" } }),
    POST: async ({ params }) => {
      if (!/^[a-f0-9-]{72}$/.test(params.token)) return new Response('Documentlink ongeldig.', { status: 404 });
      const hash = await tokenHash(params.token);
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const { data: row } = await supabaseAdmin.from('document_deliveries').select('id,status,expires_at,pdf_base64').eq('token_hash', hash).maybeSingle();
      if (!row || !mayOpenDocument(row.status, row.expires_at)) return new Response('Deze documentlink is niet beschikbaar of vervallen.', { status: 404, headers: { 'Cache-Control': 'no-store' } });
      const { error } = await supabaseAdmin.from('document_open_events').insert({ delivery_id: row.id });
      if (error) return new Response('Openen kon niet geregistreerd worden. Probeer opnieuw of gebruik de mailbijlage.', { status: 503 });
      return new Response(Uint8Array.from(atob(row.pdf_base64), c => c.charCodeAt(0)), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="Riory-document.pdf"', 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' } });
    },
  } },
});