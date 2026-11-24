ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'customer';

CREATE TABLE IF NOT EXISTS public.customer_portal_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id uuid UNIQUE,
  email text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (customer_id, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_accounts TO authenticated;
GRANT ALL ON public.customer_portal_accounts TO service_role;

ALTER TABLE public.customer_portal_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage customer portal accounts"
  ON public.customer_portal_accounts
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Portal users read own active account"
  ON public.customer_portal_accounts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() AND active = true);

CREATE TABLE IF NOT EXISTS public.customer_portal_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_account_id uuid NOT NULL REFERENCES public.customer_portal_accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_portal_invitations TO authenticated;
GRANT ALL ON public.customer_portal_invitations TO service_role;

ALTER TABLE public.customer_portal_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage customer portal invitations"
  ON public.customer_portal_invitations
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.my_portal_customer_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT customer_id
  FROM public.customer_portal_accounts
  WHERE user_id = auth.uid()
    AND active = true
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.my_portal_customer_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_portal_customer_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_customer_portal_invitation(p_hash text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  UPDATE public.customer_portal_invitations
  SET consumed_at = now()
  WHERE token_hash = p_hash
    AND consumed_at IS NULL
    AND expires_at > now()
  RETURNING portal_account_id INTO v_account_id;

  RETURN v_account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_customer_portal_invitation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_customer_portal_invitation(text) TO service_role;
