CREATE TABLE public.intervention_source_snapshots (
 source text PRIMARY KEY CHECK (source = 'simpla'),
 rows jsonb NOT NULL CHECK (jsonb_typeof(rows) = 'array'),
 fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.intervention_source_snapshots TO authenticated;
GRANT ALL ON public.intervention_source_snapshots TO service_role;
ALTER TABLE public.intervention_source_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY intervention_snapshot_admin_only ON public.intervention_source_snapshots FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
COMMENT ON TABLE public.intervention_source_snapshots IS 'Private last successful Simpla map address snapshot; keeps historical addresses available during upstream outages. No public access.';