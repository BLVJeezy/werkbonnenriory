import { createFileRoute } from '@tanstack/react-router';
import { mayOpenDocument, tokenHash } from '@/lib/document-tracking';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/document/$token')({
  head: () => ({ meta: [{ title: 'Document openen — Riory' }, { name: 'description', content: 'Uw beveiligde Riory-document openen.' }, { property: 'og:title', content: 'Document openen — Riory' }, { property: 'og:description', content: 'Uw beveiligde Riory-document openen.' }, { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' }, { name: 'robots', content: 'noindex,nofollow' }] }),
  component: DocumentOpening,
  server: { handlers: {
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
function DocumentOpening() {
  const { token } = Route.useParams();
  return <main className="mx-auto max-w-xl space-y-6 py-12"><h1 className="text-3xl font-black uppercase">Riory · Document</h1><p className="text-muted-foreground">Bij het openen wordt het tijdstip geregistreerd voor documentopvolging. We bewaren hierbij geen cookies, IP-adressen of apparaatgegevens.</p><form method="post" action={`/document/${encodeURIComponent(token)}`}><Button type="submit">Document openen</Button></form><p className="text-sm text-muted-foreground">Bewaar deze persoonlijke link zorgvuldig.</p></main>;
}