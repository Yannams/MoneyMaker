DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'withdrawal_status') THEN
    CREATE TYPE public.withdrawal_status AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'canceled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  destination_phone TEXT NOT NULL,
  destination_name TEXT,
  provider TEXT NOT NULL DEFAULT 'fedapay',
  status public.withdrawal_status NOT NULL DEFAULT 'pending',
  provider_reference TEXT,
  provider_payload JSONB,
  failure_reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_business_id ON public.withdrawal_requests(business_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON public.withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_created_at ON public.withdrawal_requests(created_at DESC);

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'withdrawal_requests' AND policyname = 'withdrawal_requests_admin_all'
  ) THEN
    CREATE POLICY withdrawal_requests_admin_all
    ON public.withdrawal_requests
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'withdrawal_requests' AND policyname = 'withdrawal_requests_select_own'
  ) THEN
    CREATE POLICY withdrawal_requests_select_own
    ON public.withdrawal_requests
    FOR SELECT
    TO authenticated
    USING (public.owns_business(business_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'withdrawal_requests' AND policyname = 'withdrawal_requests_insert_own'
  ) THEN
    CREATE POLICY withdrawal_requests_insert_own
    ON public.withdrawal_requests
    FOR INSERT
    TO authenticated
    WITH CHECK (public.owns_business(business_id));
  END IF;
END $$;

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

REVOKE ALL ON FUNCTION public.get_business_wallet_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_business_wallet_summary(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.list_business_withdrawal_requests(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_business_withdrawal_requests(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.create_withdrawal_request(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_withdrawal_request(UUID, NUMERIC, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.prepare_withdrawal_for_processing(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_withdrawal_for_processing(UUID) TO authenticated;
