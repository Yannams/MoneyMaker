CREATE TABLE IF NOT EXISTS public.runtime_feature_flags (
  feature_name TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.runtime_feature_flags (feature_name, enabled)
VALUES
  ('payment_link_generation', true),
  ('wallet', true)
ON CONFLICT (feature_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_feature_enabled(
  _feature_name TEXT,
  _default_enabled BOOLEAN DEFAULT true
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT rff.enabled
      FROM public.runtime_feature_flags rff
      WHERE rff.feature_name = _feature_name
      LIMIT 1
    ),
    _default_enabled
  );
$$;

CREATE OR REPLACE FUNCTION public.assert_feature_enabled(
  _feature_name TEXT,
  _error_message TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_feature_enabled(_feature_name) THEN
    RAISE EXCEPTION '%', COALESCE(_error_message, format('Feature %s is disabled.', _feature_name));
  END IF;
END;
$$;

REVOKE ALL ON TABLE public.runtime_feature_flags FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_feature_enabled(TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assert_feature_enabled(TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_feature_enabled(TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_feature_enabled(TEXT, TEXT) TO anon, authenticated;

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

  PERFORM public.assert_feature_enabled(
    'payment_link_generation',
    'La generation de liens est desactivee sur cet environnement'
  );

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

CREATE OR REPLACE FUNCTION public.create_personal_payment_link(
  _offre_id UUID,
  _client_id UUID,
  _expires_at TIMESTAMPTZ DEFAULT NULL,
  _max_uses INTEGER DEFAULT 1
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

  PERFORM public.assert_feature_enabled(
    'payment_link_generation',
    'La generation de liens est desactivee sur cet environnement'
  );

  IF _max_uses IS NOT NULL AND _max_uses <= 0 THEN
    RAISE EXCEPTION 'max_uses doit etre > 0';
  END IF;

  IF NOT public.is_admin(auth.uid()) AND NOT public.owns_offre(_offre_id, auth.uid()) THEN
    RAISE EXCEPTION 'Action non autorisee';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = _client_id) THEN
    RAISE EXCEPTION 'Client introuvable';
  END IF;

  LOOP
    v_token := encode(extensions.gen_random_bytes(16), 'hex');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.payment_links pl WHERE pl.token = v_token);
  END LOOP;

  INSERT INTO public.payment_links (offre_id, token, created_by, expires_at, max_uses, target_client_id)
  VALUES (_offre_id, v_token, auth.uid(), _expires_at, _max_uses, _client_id);

  RETURN QUERY
  SELECT v_token, _expires_at, _max_uses;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_business_wallet_summary(_business_id UUID)
RETURNS TABLE (
  business_id UUID,
  confirmed_incoming NUMERIC,
  reserved_withdrawals NUMERIC,
  total_withdrawn NUMERIC,
  available_balance NUMERIC,
  default_phone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_confirmed_incoming NUMERIC := 0;
  v_reserved_withdrawals NUMERIC := 0;
  v_total_withdrawn NUMERIC := 0;
  v_default_phone TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  PERFORM public.assert_feature_enabled(
    'wallet',
    'Le portefeuille est desactive sur cet environnement'
  );

  IF NOT public.is_admin(auth.uid()) AND NOT public.owns_business(_business_id, auth.uid()) THEN
    RAISE EXCEPTION 'Action non autorisee';
  END IF;

  SELECT COALESCE(SUM(t.amount), 0)
  INTO v_confirmed_incoming
  FROM public.transactions t
  JOIN public.commandes c ON c.id = t.commande_id
  JOIN public.offres o ON o.id = c.offre_id
  WHERE o.business_id = _business_id
    AND t.status = 'success';

  SELECT COALESCE(SUM(wr.amount), 0)
  INTO v_reserved_withdrawals
  FROM public.withdrawal_requests wr
  WHERE wr.business_id = _business_id
    AND wr.status IN ('pending', 'processing');

  SELECT COALESCE(SUM(wr.amount), 0)
  INTO v_total_withdrawn
  FROM public.withdrawal_requests wr
  WHERE wr.business_id = _business_id
    AND wr.status = 'succeeded';

  SELECT bm.phone
  INTO v_default_phone
  FROM public.business b
  JOIN public.businessmen bm ON bm.id = b.businessman_id
  WHERE b.id = _business_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    _business_id AS business_id,
    v_confirmed_incoming AS confirmed_incoming,
    v_reserved_withdrawals AS reserved_withdrawals,
    v_total_withdrawn AS total_withdrawn,
    GREATEST(v_confirmed_incoming - v_reserved_withdrawals - v_total_withdrawn, 0) AS available_balance,
    v_default_phone AS default_phone;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_business_withdrawal_requests(_business_id UUID)
RETURNS TABLE (
  id UUID,
  amount NUMERIC,
  destination_phone TEXT,
  destination_name TEXT,
  status public.withdrawal_status,
  provider_reference TEXT,
  failure_reason TEXT,
  requested_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  PERFORM public.assert_feature_enabled(
    'wallet',
    'Le portefeuille est desactive sur cet environnement'
  );

  IF NOT public.is_admin(auth.uid()) AND NOT public.owns_business(_business_id, auth.uid()) THEN
    RAISE EXCEPTION 'Action non autorisee';
  END IF;

  RETURN QUERY
  SELECT
    wr.id,
    wr.amount,
    wr.destination_phone,
    wr.destination_name,
    wr.status,
    wr.provider_reference,
    wr.failure_reason,
    wr.requested_at,
    wr.processed_at,
    wr.created_at
  FROM public.withdrawal_requests wr
  WHERE wr.business_id = _business_id
  ORDER BY wr.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_withdrawal_request(
  _business_id UUID,
  _amount NUMERIC,
  _destination_phone TEXT,
  _destination_name TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  amount NUMERIC,
  destination_phone TEXT,
  status public.withdrawal_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_available_balance NUMERIC := 0;
  v_destination_phone TEXT := btrim(COALESCE(_destination_phone, ''));
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  PERFORM public.assert_feature_enabled(
    'wallet',
    'Le portefeuille est desactive sur cet environnement'
  );

  IF NOT public.is_admin(auth.uid()) AND NOT public.owns_business(_business_id, auth.uid()) THEN
    RAISE EXCEPTION 'Action non autorisee';
  END IF;

  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Le montant doit etre superieur a 0';
  END IF;

  IF v_destination_phone = '' THEN
    RAISE EXCEPTION 'Le numero de destination est obligatoire';
  END IF;

  SELECT ws.available_balance
  INTO v_available_balance
  FROM public.get_business_wallet_summary(_business_id) ws
  LIMIT 1;

  IF _amount > COALESCE(v_available_balance, 0) THEN
    RAISE EXCEPTION 'Solde insuffisant pour ce retrait';
  END IF;

  INSERT INTO public.withdrawal_requests (
    business_id,
    requested_by,
    amount,
    destination_phone,
    destination_name,
    status
  )
  VALUES (
    _business_id,
    auth.uid(),
    _amount,
    v_destination_phone,
    NULLIF(btrim(COALESCE(_destination_name, '')), ''),
    'pending'
  )
  RETURNING withdrawal_requests.id INTO v_id;

  RETURN QUERY
  SELECT
    wr.id,
    wr.amount,
    wr.destination_phone,
    wr.status
  FROM public.withdrawal_requests wr
  WHERE wr.id = v_id
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_withdrawal_for_processing(_withdrawal_id UUID)
RETURNS TABLE (
  withdrawal_id UUID,
  business_id UUID,
  business_name TEXT,
  amount NUMERIC,
  destination_phone TEXT,
  destination_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.withdrawal_requests%ROWTYPE;
  v_business_name TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  PERFORM public.assert_feature_enabled(
    'wallet',
    'Le portefeuille est desactive sur cet environnement'
  );

  SELECT wr.*
  INTO v_row
  FROM public.withdrawal_requests wr
  WHERE wr.id = _withdrawal_id
    AND (public.is_admin(auth.uid()) OR public.owns_business(wr.business_id, auth.uid()))
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande de retrait introuvable';
  END IF;

  SELECT b.name
  INTO v_business_name
  FROM public.business b
  WHERE b.id = v_row.business_id
  LIMIT 1;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Cette demande ne peut pas etre traitee';
  END IF;

  UPDATE public.withdrawal_requests wr
  SET
    status = 'processing',
    failure_reason = NULL,
    updated_at = now()
  WHERE wr.id = _withdrawal_id
    AND wr.status = 'pending'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette demande est deja en cours de traitement';
  END IF;

  RETURN QUERY
  SELECT
    v_row.id AS withdrawal_id,
    v_row.business_id,
    v_business_name,
    v_row.amount,
    v_row.destination_phone,
    v_row.destination_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_withdrawal_for_processing_by_user(
  _withdrawal_id UUID,
  _user_id UUID
)
RETURNS TABLE (
  withdrawal_id UUID,
  business_id UUID,
  business_name TEXT,
  amount NUMERIC,
  destination_phone TEXT,
  destination_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.withdrawal_requests%ROWTYPE;
  v_business_name TEXT;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Utilisateur non authentifie';
  END IF;

  PERFORM public.assert_feature_enabled(
    'wallet',
    'Le portefeuille est desactive sur cet environnement'
  );

  SELECT wr.*
  INTO v_row
  FROM public.withdrawal_requests wr
  WHERE wr.id = _withdrawal_id
    AND (public.is_admin(_user_id) OR public.owns_business(wr.business_id, _user_id))
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande de retrait introuvable';
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'Cette demande ne peut pas etre traitee';
  END IF;

  UPDATE public.withdrawal_requests wr
  SET
    status = 'processing',
    failure_reason = NULL,
    updated_at = now()
  WHERE wr.id = _withdrawal_id
    AND wr.status = 'pending'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette demande est deja en cours de traitement';
  END IF;

  SELECT b.name
  INTO v_business_name
  FROM public.business b
  WHERE b.id = v_row.business_id
  LIMIT 1;

  RETURN QUERY
  SELECT
    v_row.id AS withdrawal_id,
    v_row.business_id,
    v_business_name,
    v_row.amount,
    v_row.destination_phone,
    v_row.destination_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_withdrawal_request(_withdrawal_id UUID)
RETURNS TABLE (
  id UUID,
  status public.withdrawal_status,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.withdrawal_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  PERFORM public.assert_feature_enabled(
    'wallet',
    'Le portefeuille est desactive sur cet environnement'
  );

  SELECT wr.*
  INTO v_row
  FROM public.withdrawal_requests wr
  WHERE wr.id = _withdrawal_id
    AND (public.is_admin(auth.uid()) OR public.owns_business(wr.business_id, auth.uid()))
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande de retrait introuvable';
  END IF;

  IF v_row.status = 'succeeded' THEN
    RAISE EXCEPTION 'Un retrait effectue ne peut pas etre annule';
  END IF;

  IF v_row.status = 'processing' THEN
    RAISE EXCEPTION 'Retrait en cours de traitement. Annulation indisponible';
  END IF;

  IF v_row.status = 'canceled' THEN
    RAISE EXCEPTION 'Cette demande est deja annulee';
  END IF;

  UPDATE public.withdrawal_requests wr
  SET
    status = 'canceled',
    failure_reason = COALESCE(wr.failure_reason, 'Annule par utilisateur'),
    processed_at = COALESCE(wr.processed_at, now()),
    updated_at = now()
  WHERE wr.id = _withdrawal_id
    AND wr.status IN ('pending', 'failed')
  RETURNING wr.id, wr.status, wr.updated_at
  INTO id, status, updated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Annulation impossible pour ce retrait';
  END IF;

  RETURN NEXT;
END;
$$;
