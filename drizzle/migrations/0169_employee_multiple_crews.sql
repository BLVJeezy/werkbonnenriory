CREATE TABLE IF NOT EXISTS public.tk_employee_crews (
  employee_id uuid NOT NULL REFERENCES public.tk_employees(id) ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, technician_id)
);

CREATE INDEX IF NOT EXISTS idx_tk_employee_crews_technician ON public.tk_employee_crews(technician_id);

INSERT INTO public.tk_employee_crews (employee_id, technician_id)
SELECT id, current_technician_id
FROM public.tk_employees
WHERE current_technician_id IS NOT NULL
ON CONFLICT (employee_id, technician_id) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tk_employee_crews TO authenticated;
GRANT ALL ON public.tk_employee_crews TO service_role;

ALTER TABLE public.tk_employee_crews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage employee crews"
  ON public.tk_employee_crews
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "employee read own allowed crews"
  ON public.tk_employee_crews
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tk_employees e
      WHERE e.id = tk_employee_crews.employee_id
        AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "employee read allowed technicians"
  ON public.technicians
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.tk_employee_crews ec
      JOIN public.tk_employees e ON e.id = ec.employee_id
      WHERE ec.technician_id = technicians.id
        AND e.user_id = auth.uid()
        AND e.active = true
    )
  );