CREATE OR REPLACE FUNCTION public.finalize_payment_with_reference(
  _payment_reference TEXT,
  _provider_reference TEXT DEFAULT NULL
)
RETURNS TABLE (
  transaction_id UUID,
  commande_id UUID,
  commande_status public.commande_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transaction_id UUID;
  v_commande_id UUID;
  v_status public.commande_status;
  v_offre_id UUID;
  v_has_limited_stock BOOLEAN;
  v_stock_updated BIGINT;
BEGIN
  IF btrim(COALESCE(_payment_reference, '')) = '' THEN
    RAISE EXCEPTION 'Reference de paiement invalide';
  END IF;

  SELECT t.id, t.commande_id, c.offre_id
  INTO v_transaction_id, v_commande_id, v_offre_id
  FROM public.transactions t
  JOIN public.commandes c ON c.id = t.commande_id
  WHERE t.id::TEXT = _payment_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction introuvable';
  END IF;

  IF v_offre_id IS NOT NULL THEN
    SELECT (o.stock_quantity IS NOT NULL)
    INTO v_has_limited_stock
    FROM public.offres o
    WHERE o.id = v_offre_id;

    IF COALESCE(v_has_limited_stock, false) THEN
      UPDATE public.offres o
      SET stock_quantity = o.stock_quantity - 1
      WHERE o.id = v_offre_id
        AND o.stock_quantity IS NOT NULL
        AND o.stock_quantity > 0;

      GET DIAGNOSTICS v_stock_updated = ROW_COUNT;
      IF COALESCE(v_stock_updated, 0) = 0 THEN
        RAISE EXCEPTION 'Stock indisponible pour cette offre';
      END IF;
    END IF;
  END IF;

  UPDATE public.transactions t
  SET
    status = 'success'::public.transaction_status,
    provider_reference = COALESCE(_provider_reference, t.provider_reference),
    paid_at = COALESCE(t.paid_at, now())
  WHERE t.id = v_transaction_id;

  UPDATE public.commandes c
  SET status = CASE
    WHEN c.type = 'recurring'::public.billing_type THEN 'active'::public.commande_status
    ELSE 'completed'::public.commande_status
  END
  WHERE c.id = v_commande_id
  RETURNING c.status INTO v_status;

  RETURN QUERY
  SELECT v_transaction_id, v_commande_id, v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_payment_with_reference(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalize_payment_with_reference(TEXT, TEXT) TO anon, authenticated;
