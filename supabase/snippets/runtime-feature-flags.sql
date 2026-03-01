-- Disable on production
INSERT INTO public.runtime_feature_flags (feature_name, enabled)
VALUES
  ('payment_link_generation', false),
  ('wallet', false)
ON CONFLICT (feature_name)
DO UPDATE SET
  enabled = EXCLUDED.enabled,
  updated_at = now();

-- Re-enable on test if needed
-- INSERT INTO public.runtime_feature_flags (feature_name, enabled)
-- VALUES
--   ('payment_link_generation', true),
--   ('wallet', true)
-- ON CONFLICT (feature_name)
-- DO UPDATE SET
--   enabled = EXCLUDED.enabled,
--   updated_at = now();
