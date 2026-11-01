CREATE TABLE public.crew_password_invitations (
 technician_id uuid PRIMARY KEY REFERENCES public.technicians(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.crew_password_invitations TO service_role;
ALTER TABLE public.crew_password_invitations ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.claim_crew_password_invitation(p_hash text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_technician uuid;
BEGIN
 UPDATE public.crew_password_invitations SET consumed_at = now()
 WHERE token_hash = p_hash AND consumed_at IS NULL AND expires_at > now()
 RETURNING technician_id INTO v_technician;
 RETURN v_technician;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_crew_password_invitation(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_crew_password_invitation(text) TO service_role;