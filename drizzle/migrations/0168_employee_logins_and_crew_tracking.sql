ALTER TABLE public.tk_employees
  ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS current_technician_id uuid REFERENCES public.technicians(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.tk_employee_crew_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.tk_employees(id) ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES public.technicians(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  assigned_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tk_employee_crew_assignments_employee ON public.tk_employee_crew_assignments(employee_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tk_employee_crew_assignments_technician ON public.tk_employee_crew_assignments(technician_id, started_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tk_employee_crew_assignments TO authenticated;
GRANT ALL ON public.tk_employee_crew_assignments TO service_role;

ALTER TABLE public.tk_employee_crew_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage crew assignments"
  ON public.tk_employee_crew_assignments
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "employee read own crew assignments"
  ON public.tk_employee_crew_assignments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tk_employees e
      WHERE e.id = tk_employee_crew_assignments.employee_id
        AND e.user_id = auth.uid()
    )
  );

CREATE TABLE IF NOT EXISTS public.tk_employee_password_invitations (
  employee_id uuid PRIMARY KEY REFERENCES public.tk_employees(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.tk_employee_password_invitations TO service_role;
ALTER TABLE public.tk_employee_password_invitations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_employee_password_invitation(p_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  UPDATE public.tk_employee_password_invitations
  SET consumed_at = now()
  WHERE token_hash = p_hash
    AND consumed_at IS NULL
    AND expires_at > now()
  RETURNING employee_id INTO v_employee_id;
  RETURN v_employee_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_employee_password_invitation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_employee_password_invitation(text) TO service_role;

CREATE OR REPLACE FUNCTION public.my_technician_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT id FROM public.technicians WHERE user_id = auth.uid() LIMIT 1),
    (SELECT current_technician_id FROM public.tk_employees WHERE user_id = auth.uid() AND active = true LIMIT 1)
  )
$$;

CREATE OR REPLACE FUNCTION public.my_crew_sees_signed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT show_signed FROM public.technicians WHERE id = public.my_technician_id() LIMIT 1),
    false
  )
$$;

CREATE POLICY "employee read own record"
  ON public.tk_employees
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "employee read assigned technician"
  ON public.technicians
  FOR SELECT
  TO authenticated
  USING (id = public.my_technician_id());