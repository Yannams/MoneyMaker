ALTER TABLE public.offres
  DROP CONSTRAINT IF EXISTS offres_interval_consistency;

ALTER TABLE public.offres
  ADD CONSTRAINT offres_interval_consistency CHECK (
    (
      billing_type = 'one_time'
      AND interval_type IS NULL
      AND interval_value IS NULL
    )
    OR
    (
      billing_type = 'recurring'
      AND (
        (interval_type IS NULL AND interval_value IS NULL)
        OR
        (interval_type IS NOT NULL AND interval_value IS NOT NULL AND interval_value > 0)
      )
    )
  );
