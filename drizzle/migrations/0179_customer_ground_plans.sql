CREATE TABLE public.customer_ground_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES public.customer_projects(id) ON DELETE SET NULL,
  work_order_id uuid NULL REFERENCES public.work_orders(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Rioolstelsel',
  background_path text NULL,
  rendered_path text NOT NULL,
  drawing_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  include_in_pdf boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_ground_plans_customer_idx ON public.customer_ground_plans (customer_id, created_at DESC);
CREATE INDEX customer_ground_plans_project_idx ON public.customer_ground_plans (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX customer_ground_plans_work_order_idx ON public.customer_ground_plans (work_order_id) WHERE work_order_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_ground_plans TO authenticated;
GRANT ALL ON public.customer_ground_plans TO service_role;

ALTER TABLE public.customer_ground_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ground_plans_admin_all"
ON public.customer_ground_plans
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "ground_plans_tech_select"
ON public.customer_ground_plans
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.work_orders w
    WHERE w.technician_id = public.my_technician_id()
      AND (
        w.id = customer_ground_plans.work_order_id
        OR w.customer_id = customer_ground_plans.customer_id
      )
  )
);

CREATE POLICY "ground_plans_tech_insert"
ON public.customer_ground_plans
FOR INSERT
TO authenticated
WITH CHECK (
  work_order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.work_orders w
    WHERE w.id = customer_ground_plans.work_order_id
      AND w.technician_id = public.my_technician_id()
      AND w.status <> 'afgetekend'
  )
);

CREATE POLICY "ground_plans_tech_update"
ON public.customer_ground_plans
FOR UPDATE
TO authenticated
USING (
  work_order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.work_orders w
    WHERE w.id = customer_ground_plans.work_order_id
      AND w.technician_id = public.my_technician_id()
      AND w.status <> 'afgetekend'
  )
)
WITH CHECK (
  work_order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.work_orders w
    WHERE w.id = customer_ground_plans.work_order_id
      AND w.technician_id = public.my_technician_id()
      AND w.status <> 'afgetekend'
  )
);

CREATE POLICY "ground_plans_tech_delete"
ON public.customer_ground_plans
FOR DELETE
TO authenticated
USING (
  work_order_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.work_orders w
    WHERE w.id = customer_ground_plans.work_order_id
      AND w.technician_id = public.my_technician_id()
      AND w.status <> 'afgetekend'
  )
);

CREATE POLICY "werkbon_fotos_tech_ground_plan_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'werkbon-fotos'
  AND EXISTS (
    SELECT 1
    FROM public.customer_ground_plans gp
    JOIN public.work_orders w ON (w.id = gp.work_order_id OR w.customer_id = gp.customer_id)
    WHERE w.technician_id = public.my_technician_id()
      AND (gp.rendered_path = storage.objects.name OR gp.background_path = storage.objects.name)
  )
);