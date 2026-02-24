CREATE OR REPLACE FUNCTION public.create_payment_link(
  _offre_id UUID,
  _expires_at TIMESTAMPTZ DEFAULT NULL,
  _max_uses INTEGER DEFAULT NULL
)
RETURNS TABLE (
  token TEXT,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  IF _max_uses IS NOT NULL AND _max_uses <= 0 THEN
    RAISE EXCEPTION 'max_uses doit etre > 0';
  END IF;

  IF NOT public.is_admin(auth.uid()) AND NOT public.owns_offre(_offre_id, auth.uid()) THEN
    RAISE EXCEPTION 'Action non autorisee';
  END IF;

  LOOP
    v_token := encode(extensions.gen_random_bytes(16), 'hex');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.payment_links pl WHERE pl.token = v_token);
  END LOOP;

  INSERT INTO public.payment_links (offre_id, token, created_by, expires_at, max_uses)
  VALUES (_offre_id, v_token, auth.uid(), _expires_at, _max_uses);

  RETURN QUERY
  SELECT v_token, _expires_at, _max_uses;
END;
$$;
