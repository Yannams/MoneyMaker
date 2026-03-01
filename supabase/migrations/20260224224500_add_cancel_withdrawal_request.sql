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

REVOKE ALL ON FUNCTION public.cancel_withdrawal_request(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_withdrawal_request(UUID) TO authenticated;
