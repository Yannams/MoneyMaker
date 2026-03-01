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

REVOKE ALL ON FUNCTION public.prepare_withdrawal_for_processing_by_user(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prepare_withdrawal_for_processing_by_user(UUID, UUID) TO authenticated;
