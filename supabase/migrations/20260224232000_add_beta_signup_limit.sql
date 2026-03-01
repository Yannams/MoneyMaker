CREATE OR REPLACE FUNCTION public.get_signup_beta_status()
RETURNS TABLE (
  max_users INTEGER,
  current_users INTEGER,
  remaining_slots INTEGER,
  is_open BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  WITH stats AS (
    SELECT 10::INTEGER AS max_users, COUNT(*)::INTEGER AS current_users
    FROM auth.users u
    WHERE u.deleted_at IS NULL
  )
  SELECT
    s.max_users,
    s.current_users,
    GREATEST(s.max_users - s.current_users, 0) AS remaining_slots,
    s.current_users < s.max_users AS is_open
  FROM stats s;
$$;

REVOKE ALL ON FUNCTION public.get_signup_beta_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_signup_beta_status() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.enforce_beta_signup_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_current_users INTEGER;
BEGIN
  -- Prevent race conditions when multiple signups happen at the same time.
  PERFORM pg_advisory_xact_lock(82310421);

  SELECT COUNT(*)::INTEGER
  INTO v_current_users
  FROM auth.users u
  WHERE u.deleted_at IS NULL;

  IF v_current_users >= 10 THEN
    RAISE EXCEPTION 'La phase de test est complete (10 utilisateurs maximum).';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_beta_signup_limit ON auth.users;

CREATE TRIGGER trg_enforce_beta_signup_limit
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.enforce_beta_signup_limit();
