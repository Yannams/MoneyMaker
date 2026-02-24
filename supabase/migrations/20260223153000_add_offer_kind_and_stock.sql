-- Add product/service semantics and stock support to offers

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offer_kind') THEN
    CREATE TYPE public.offer_kind AS ENUM ('product', 'service');
  END IF;
END $$;

ALTER TABLE public.offres
  ADD COLUMN IF NOT EXISTS kind public.offer_kind NOT NULL DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS stock_quantity INTEGER,
  ADD COLUMN IF NOT EXISTS stock_alert_threshold INTEGER;

ALTER TABLE public.offres
  DROP CONSTRAINT IF EXISTS offres_stock_consistency;

ALTER TABLE public.offres
  ADD CONSTRAINT offres_stock_consistency CHECK (
    (stock_quantity IS NULL OR stock_quantity >= 0)
    AND
    (
      stock_alert_threshold IS NULL
      OR (
        stock_alert_threshold >= 0
        AND stock_quantity IS NOT NULL
        AND stock_alert_threshold <= stock_quantity
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_offres_kind ON public.offres(kind);
