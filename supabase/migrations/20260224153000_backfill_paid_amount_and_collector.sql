-- Add payment collector metadata, backfill paid_amount from visit notes, and enforce payment integrity.

ALTER TABLE public.visits
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10, 2);

ALTER TABLE public.visits
ADD COLUMN IF NOT EXISTS paid_collected_by UUID;

ALTER TABLE public.visits
ADD COLUMN IF NOT EXISTS paid_collected_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'visits_paid_collected_by_fkey'
  ) THEN
    ALTER TABLE public.visits
      ADD CONSTRAINT visits_paid_collected_by_fkey
      FOREIGN KEY (paid_collected_by)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

WITH parsed_notes AS (
  SELECT
    id,
    COALESCE(
      NULLIF(
        (regexp_match(
          lower(COALESCE(notes, '')),
          '(?:paid(?:\s*amount)?|amount|price)\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)'
        ))[1],
        ''
      )::NUMERIC,
      NULLIF(
        (regexp_match(
          lower(COALESCE(notes, '')),
          '([0-9]+(?:\.[0-9]+)?)\s*(?:nis|n\.?i\.?s|shekel|shekels)'
        ))[1],
        ''
      )::NUMERIC,
      0
    ) AS parsed_amount
  FROM public.visits
)
UPDATE public.visits v
SET paid_amount = GREATEST(parsed_notes.parsed_amount, 0)
FROM parsed_notes
WHERE v.id = parsed_notes.id
  AND COALESCE(v.paid_amount, 0) = 0
  AND parsed_notes.parsed_amount > 0;

UPDATE public.visits
SET
  paid_collected_by = COALESCE(paid_collected_by, doctor_id, created_by),
  paid_collected_at = COALESCE(paid_collected_at, updated_at, visit_date, NOW())
WHERE COALESCE(paid_amount, 0) > 0;

UPDATE public.visits
SET paid_amount = 0
WHERE paid_amount IS NULL;

ALTER TABLE public.visits
ALTER COLUMN paid_amount SET DEFAULT 0,
ALTER COLUMN paid_amount SET NOT NULL;

ALTER TABLE public.visits
DROP CONSTRAINT IF EXISTS visits_paid_amount_non_negative;

ALTER TABLE public.visits
ADD CONSTRAINT visits_paid_amount_non_negative CHECK (paid_amount >= 0);

CREATE INDEX IF NOT EXISTS idx_visits_paid_collected_by
ON public.visits (paid_collected_by);

CREATE INDEX IF NOT EXISTS idx_visits_paid_collected_at
ON public.visits (paid_collected_at DESC);

CREATE OR REPLACE FUNCTION public.ensure_visit_payment_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.paid_amount := COALESCE(NEW.paid_amount, 0);

  IF NEW.paid_amount < 0 THEN
    RAISE EXCEPTION 'paid_amount cannot be negative';
  END IF;

  IF NEW.paid_amount > 0 THEN
    NEW.paid_collected_at := COALESCE(NEW.paid_collected_at, NOW());
    NEW.paid_collected_by := COALESCE(NEW.paid_collected_by, auth.uid(), NEW.doctor_id, NEW.created_by);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_visit_payment_metadata ON public.visits;

CREATE TRIGGER trg_ensure_visit_payment_metadata
BEFORE INSERT OR UPDATE OF paid_amount, paid_collected_by, doctor_id, created_by
ON public.visits
FOR EACH ROW
EXECUTE FUNCTION public.ensure_visit_payment_metadata();

COMMENT ON COLUMN public.visits.paid_collected_by IS 'Doctor/user who collected the visit payment.';
COMMENT ON COLUMN public.visits.paid_collected_at IS 'Timestamp when payment was collected.';
