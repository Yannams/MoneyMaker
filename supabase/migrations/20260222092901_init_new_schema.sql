-- New business schema
-- Uses Supabase Auth (`auth.users`) as source of truth for users.
-- `profiles` stores app-level user data (name, role, created_at).
-- Note: `clients` table is added because `commandes.client_id` depends on it.

create extension if not exists "pgcrypto";

-- Enums
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    CREATE TYPE public.user_role AS ENUM ('admin', 'businessman');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_type') THEN
    CREATE TYPE public.billing_type AS ENUM ('one_time', 'recurring');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'interval_type') THEN
    CREATE TYPE public.interval_type AS ENUM ('daily', 'weekly', 'monthly', 'yearly');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'commande_status') THEN
    CREATE TYPE public.commande_status AS ENUM ('pending', 'active', 'completed', 'canceled');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_method') THEN
    CREATE TYPE public.transaction_method AS ENUM ('cash', 'mobile_money');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transaction_status') THEN
    CREATE TYPE public.transaction_status AS ENUM ('pending', 'success', 'failed');
  END IF;
END $$;

-- PROFILES (linked to auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  role public.user_role NOT NULL DEFAULT 'businessman',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BUSINESSMEN
CREATE TABLE IF NOT EXISTS public.businessmen (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  ifu TEXT UNIQUE,
  phone TEXT NOT NULL,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- BUSINESS
CREATE TABLE IF NOT EXISTS public.business (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  businessman_id UUID NOT NULL REFERENCES public.businessmen(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- OFFRES
CREATE TABLE IF NOT EXISTS public.offres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  billing_type public.billing_type NOT NULL,
  interval_type public.interval_type,
  interval_value INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT offres_interval_consistency CHECK (
    (billing_type = 'one_time' AND interval_type IS NULL AND interval_value IS NULL)
    OR
    (billing_type = 'recurring' AND interval_type IS NOT NULL AND interval_value IS NOT NULL AND interval_value > 0)
  )
);

-- CLIENTS (added for COMMANDES FK)
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- COMMANDES
CREATE TABLE IF NOT EXISTS public.commandes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  offre_id UUID NOT NULL REFERENCES public.offres(id) ON DELETE RESTRICT,
  type public.billing_type NOT NULL,
  status public.commande_status NOT NULL DEFAULT 'pending',
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  next_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT commandes_due_consistency CHECK (
    (type = 'one_time' AND next_due_at IS NULL)
    OR
    (type = 'recurring')
  )
);

-- TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id UUID NOT NULL REFERENCES public.commandes(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  method public.transaction_method NOT NULL,
  status public.transaction_status NOT NULL DEFAULT 'pending',
  provider_reference TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Authorization helpers
CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = COALESCE(_user_id, auth.uid())
      AND p.role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_businessman_owner(_businessman_id UUID, _user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.businessmen bm
    WHERE bm.id = _businessman_id
      AND bm.user_id = COALESCE(_user_id, auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_business(_business_id UUID, _user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.business b
    JOIN public.businessmen bm ON bm.id = b.businessman_id
    WHERE b.id = _business_id
      AND bm.user_id = COALESCE(_user_id, auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_offre(_offre_id UUID, _user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.offres o
    JOIN public.business b ON b.id = o.business_id
    JOIN public.businessmen bm ON bm.id = b.businessman_id
    WHERE o.id = _offre_id
      AND bm.user_id = COALESCE(_user_id, auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.owns_commande(_commande_id UUID, _user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.commandes c
    JOIN public.offres o ON o.id = c.offre_id
    JOIN public.business b ON b.id = o.business_id
    JOIN public.businessmen bm ON bm.id = b.businessman_id
    WHERE c.id = _commande_id
      AND bm.user_id = COALESCE(_user_id, auth.uid())
  );
$$;

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businessmen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- PROFILES policies
CREATE POLICY profiles_admin_all
ON public.profiles
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY profiles_select_own
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY profiles_insert_own
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY profiles_update_own
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- BUSINESSMEN policies
CREATE POLICY businessmen_admin_all
ON public.businessmen
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY businessmen_select_own
ON public.businessmen
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY businessmen_insert_own
ON public.businessmen
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY businessmen_update_own
ON public.businessmen
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY businessmen_delete_own
ON public.businessmen
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- BUSINESS policies
CREATE POLICY business_admin_all
ON public.business
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY business_select_own
ON public.business
FOR SELECT
TO authenticated
USING (public.owns_business(id));

CREATE POLICY business_insert_own
ON public.business
FOR INSERT
TO authenticated
WITH CHECK (public.is_businessman_owner(businessman_id));

CREATE POLICY business_update_own
ON public.business
FOR UPDATE
TO authenticated
USING (public.owns_business(id))
WITH CHECK (public.is_businessman_owner(businessman_id));

CREATE POLICY business_delete_own
ON public.business
FOR DELETE
TO authenticated
USING (public.owns_business(id));

-- OFFRES policies
CREATE POLICY offres_admin_all
ON public.offres
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY offres_select_own
ON public.offres
FOR SELECT
TO authenticated
USING (public.owns_business(business_id));

CREATE POLICY offres_insert_own
ON public.offres
FOR INSERT
TO authenticated
WITH CHECK (public.owns_business(business_id));

CREATE POLICY offres_update_own
ON public.offres
FOR UPDATE
TO authenticated
USING (public.owns_offre(id))
WITH CHECK (public.owns_business(business_id));

CREATE POLICY offres_delete_own
ON public.offres
FOR DELETE
TO authenticated
USING (public.owns_offre(id));

-- CLIENTS policies
CREATE POLICY clients_admin_all
ON public.clients
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY clients_select_linked_to_own_business
ON public.clients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.commandes c
    WHERE c.client_id = clients.id
      AND public.owns_offre(c.offre_id)
  )
);

CREATE POLICY clients_insert_authenticated
ON public.clients
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY clients_update_linked_to_own_business
ON public.clients
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.commandes c
    WHERE c.client_id = clients.id
      AND public.owns_offre(c.offre_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.commandes c
    WHERE c.client_id = clients.id
      AND public.owns_offre(c.offre_id)
  )
);

CREATE POLICY clients_delete_linked_to_own_business
ON public.clients
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.commandes c
    WHERE c.client_id = clients.id
      AND public.owns_offre(c.offre_id)
  )
);

-- COMMANDES policies
CREATE POLICY commandes_admin_all
ON public.commandes
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY commandes_select_own
ON public.commandes
FOR SELECT
TO authenticated
USING (public.owns_offre(offre_id));

CREATE POLICY commandes_insert_own
ON public.commandes
FOR INSERT
TO authenticated
WITH CHECK (public.owns_offre(offre_id));

CREATE POLICY commandes_update_own
ON public.commandes
FOR UPDATE
TO authenticated
USING (public.owns_commande(id))
WITH CHECK (public.owns_offre(offre_id));

CREATE POLICY commandes_delete_own
ON public.commandes
FOR DELETE
TO authenticated
USING (public.owns_commande(id));

-- TRANSACTIONS policies
CREATE POLICY transactions_admin_all
ON public.transactions
FOR ALL
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY transactions_select_own
ON public.transactions
FOR SELECT
TO authenticated
USING (public.owns_commande(commande_id));

CREATE POLICY transactions_insert_own
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (public.owns_commande(commande_id));

CREATE POLICY transactions_update_own
ON public.transactions
FOR UPDATE
TO authenticated
USING (public.owns_commande(commande_id))
WITH CHECK (public.owns_commande(commande_id));

CREATE POLICY transactions_delete_own
ON public.transactions
FOR DELETE
TO authenticated
USING (public.owns_commande(commande_id));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_business_businessman_id ON public.business(businessman_id);
CREATE INDEX IF NOT EXISTS idx_offres_business_id ON public.offres(business_id);
CREATE INDEX IF NOT EXISTS idx_offres_active ON public.offres(active);
CREATE INDEX IF NOT EXISTS idx_commandes_client_id ON public.commandes(client_id);
CREATE INDEX IF NOT EXISTS idx_commandes_offre_id ON public.commandes(offre_id);
CREATE INDEX IF NOT EXISTS idx_commandes_status ON public.commandes(status);
CREATE INDEX IF NOT EXISTS idx_commandes_next_due_at ON public.commandes(next_due_at);
CREATE INDEX IF NOT EXISTS idx_transactions_commande_id ON public.transactions(commande_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_paid_at ON public.transactions(paid_at);
