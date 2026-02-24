UPDATE public.offres
SET
  interval_type = COALESCE(interval_type, 'monthly'::public.interval_type),
  interval_value = CASE
    WHEN interval_value IS NULL OR interval_value <= 0 THEN 1
    ELSE interval_value
  END
WHERE billing_type = 'recurring'
  AND (interval_type IS NULL OR interval_value IS NULL OR interval_value <= 0);

ALTER TABLE public.offres
  DROP CONSTRAINT IF EXISTS offres_interval_consistency;

ALTER TABLE public.offres
  ADD CONSTRAINT offres_interval_consistency CHECK (
    (billing_type = 'one_time' AND interval_type IS NULL AND interval_value IS NULL)
    OR
    (billing_type = 'recurring' AND interval_type IS NOT NULL AND interval_value IS NOT NULL AND interval_value > 0)
  );
