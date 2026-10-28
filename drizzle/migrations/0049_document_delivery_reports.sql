CREATE TABLE public.document_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 document_type text NOT NULL CHECK (document_type IN ('factuur','creditnota','offerte','werkbon','herinnering')),
 document_id uuid NOT NULL,
 label text NOT NULL,
 recipient text NOT NULL,
 token_hash text NOT NULL UNIQUE,
 pdf_base64 text NOT NULL,
 status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','accepted','uncertain','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz,
 expires_at timestamptz NOT NULL DEFAULT (now() + interval '1 year')
);
GRANT SELECT ON public.document_deliveries TO authenticated;
GRANT ALL ON public.document_deliveries TO service_role;
ALTER TABLE public.document_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read document delivery reports" ON public.document_deliveries FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE INDEX document_deliveries_lookup ON public.document_deliveries(document_type,document_id,created_at DESC);
CREATE TABLE public.document_open_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 delivery_id uuid NOT NULL REFERENCES public.document_deliveries(id) ON DELETE CASCADE,
 opened_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.document_open_events TO authenticated;
GRANT ALL ON public.document_open_events TO service_role;
ALTER TABLE public.document_open_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read document openings" ON public.document_open_events FOR SELECT TO authenticated USING(public.has_role(auth.uid(),'admin'));
CREATE INDEX document_open_events_delivery ON public.document_open_events(delivery_id,opened_at DESC);