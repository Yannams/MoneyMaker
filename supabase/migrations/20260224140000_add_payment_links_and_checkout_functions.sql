DROP FUNCTION IF EXISTS public.create_payment_link_for_customer(UUID, TEXT, TEXT, TEXT, public.transaction_method, TIMESTAMPTZ);

CREATE TABLE IF NOT EXISTS public.payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offre_id UUID NOT NULL REFERENCES public.offres(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER CHECK (max_uses IS NULL OR max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_links_offre_id ON public.payment_links(offre_id);
CREATE INDEX IF NOT EXISTS idx_payment_links_token ON public.payment_links(token);

ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_links' AND policyname = 'payment_links_admin_all'
  ) THEN
    CREATE POLICY payment_links_admin_all
    ON public.payment_links
    FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_links' AND policyname = 'payment_links_select_own'
  ) THEN
    CREATE POLICY payment_links_select_own
    ON public.payment_links
    FOR SELECT
    TO authenticated
    USING (public.owns_offre(offre_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_links' AND policyname = 'payment_links_insert_own'
  ) THEN
    CREATE POLICY payment_links_insert_own
    ON public.payment_links
    FOR INSERT
    TO authenticated
    WITH CHECK (public.owns_offre(offre_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_links' AND policyname = 'payment_links_update_own'
  ) THEN
    CREATE POLICY payment_links_update_own
    ON public.payment_links
    FOR UPDATE
    TO authenticated
    USING (public.owns_offre(offre_id))
    WITH CHECK (public.owns_offre(offre_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'payment_links' AND policyname = 'payment_links_delete_own'
  ) THEN
    CREATE POLICY payment_links_delete_own
    ON public.payment_links
    FOR DELETE
    TO authenticated
    USING (public.owns_offre(offre_id));
  END IF;
END $$;

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

CREATE OR REPLACE FUNCTION public.get_payment_link_details(_token TEXT)
RETURNS TABLE (
  offre_id UUID,
  offer_name TEXT,
  business_name TEXT,
  price NUMERIC,
  billing_type public.billing_type,
  interval_type public.interval_type,
  interval_value INTEGER,
  stock_quantity INTEGER,
  is_available BOOLEAN,
  unavailable_reason TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id AS offre_id,
    o.name AS offer_name,
    b.name AS business_name,
    o.price,
    o.billing_type,
    o.interval_type,
    o.interval_value,
    o.stock_quantity,
    (
      pl.active
      AND (pl.expires_at IS NULL OR pl.expires_at > now())
      AND (pl.max_uses IS NULL OR pl.used_count < pl.max_uses)
      AND o.active
      AND (o.stock_quantity IS NULL OR o.stock_quantity > 0)
    ) AS is_available,
    CASE
      WHEN NOT pl.active THEN 'Lien desactive'
      WHEN pl.expires_at IS NOT NULL AND pl.expires_at <= now() THEN 'Lien expire'
      WHEN pl.max_uses IS NOT NULL AND pl.used_count >= pl.max_uses THEN 'Lien deja utilise'
      WHEN NOT o.active THEN 'Offre non disponible'
      WHEN o.stock_quantity IS NOT NULL AND o.stock_quantity <= 0 THEN 'Stock epuise'
      ELSE NULL
    END AS unavailable_reason
  FROM public.payment_links pl
  JOIN public.offres o ON o.id = pl.offre_id
  JOIN public.business b ON b.id = o.business_id
  WHERE pl.token = _token
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.start_payment_with_link(
  _token TEXT,
  _customer_name TEXT,
  _customer_phone TEXT,
  _customer_email TEXT DEFAULT NULL,
  _method public.transaction_method DEFAULT 'mobile_money'
)
RETURNS TABLE (
  payment_reference TEXT,
  client_id UUID,
  commande_id UUID,
  transaction_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.payment_links%ROWTYPE;
  v_offer public.offres%ROWTYPE;
  v_client_id UUID;
  v_commande_id UUID;
  v_transaction_id UUID;
  v_customer_name TEXT := btrim(COALESCE(_customer_name, ''));
  v_customer_phone TEXT := btrim(COALESCE(_customer_phone, ''));
  v_customer_email TEXT := NULLIF(lower(btrim(COALESCE(_customer_email, ''))), '');
BEGIN
  IF btrim(COALESCE(_token, '')) = '' THEN
    RAISE EXCEPTION 'Lien invalide';
  END IF;

  IF v_customer_name = '' THEN
    RAISE EXCEPTION 'Le nom du client est obligatoire';
  END IF;

  IF v_customer_phone = '' THEN
    RAISE EXCEPTION 'Le telephone du client est obligatoire';
  END IF;

  SELECT *
  INTO v_link
  FROM public.payment_links pl
  WHERE pl.token = _token
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lien invalide';
  END IF;

  IF NOT v_link.active THEN
    RAISE EXCEPTION 'Ce lien est desactive';
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at <= now() THEN
    RAISE EXCEPTION 'Ce lien a expire';
  END IF;

  IF v_link.max_uses IS NOT NULL AND v_link.used_count >= v_link.max_uses THEN
    RAISE EXCEPTION 'Ce lien ne peut plus etre utilise';
  END IF;

  SELECT *
  INTO v_offer
  FROM public.offres
  WHERE id = v_link.offre_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Offre introuvable';
  END IF;

  IF NOT v_offer.active THEN
    RAISE EXCEPTION 'Cette offre n''est plus disponible';
  END IF;

  IF v_offer.stock_quantity IS NOT NULL AND v_offer.stock_quantity <= 0 THEN
    RAISE EXCEPTION 'Stock indisponible';
  END IF;

  IF v_customer_email IS NOT NULL THEN
    SELECT c.id
    INTO v_client_id
    FROM public.clients c
    WHERE lower(c.email) = v_customer_email
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    SELECT c.id
    INTO v_client_id
    FROM public.clients c
    WHERE c.phone = v_customer_phone
    ORDER BY c.created_at ASC
    LIMIT 1;
  END IF;

  IF v_client_id IS NULL THEN
    INSERT INTO public.clients (name, phone, email)
    VALUES (v_customer_name, v_customer_phone, v_customer_email)
    RETURNING id INTO v_client_id;
  ELSE
    UPDATE public.clients
    SET
      name = v_customer_name,
      phone = v_customer_phone,
      email = COALESCE(public.clients.email, v_customer_email)
    WHERE id = v_client_id;
  END IF;

  INSERT INTO public.commandes (
    client_id,
    offre_id,
    type,
    status,
    total_amount,
    next_due_at
  )
  VALUES (
    v_client_id,
    v_offer.id,
    v_offer.billing_type,
    'pending'::public.commande_status,
    v_offer.price,
    NULL
  )
  RETURNING id INTO v_commande_id;

  INSERT INTO public.transactions (
    commande_id,
    amount,
    method,
    status,
    provider_reference,
    paid_at
  )
  VALUES (
    v_commande_id,
    v_offer.price,
    _method,
    'pending'::public.transaction_status,
    NULL,
    NULL
  )
  RETURNING id INTO v_transaction_id;

  UPDATE public.payment_links
  SET
    used_count = used_count + 1,
    active = CASE
      WHEN max_uses IS NOT NULL AND used_count + 1 >= max_uses THEN false
      ELSE active
    END
  WHERE id = v_link.id;

  RETURN QUERY
  SELECT v_transaction_id::TEXT, v_client_id, v_commande_id, v_transaction_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_payment_link(UUID, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_payment_link(UUID, TIMESTAMPTZ, INTEGER) TO authenticated;

REVOKE ALL ON FUNCTION public.get_payment_link_details(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_payment_link_details(TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.start_payment_with_link(TEXT, TEXT, TEXT, TEXT, public.transaction_method) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_payment_with_link(TEXT, TEXT, TEXT, TEXT, public.transaction_method) TO anon, authenticated;
