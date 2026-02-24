-- Backfill visit paid_amount from notes (Arabic/English patterns)
-- and ensure payment collector metadata is populated.

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

WITH extracted_payments AS (
  SELECT
    id,
    COALESCE(
      NULLIF(
        REPLACE(
          (regexp_match(
            lower(COALESCE(notes, '')),
            '(?:paid(?:\s*amount)?|amount|price|المدفوع|المبلغ|دفع)\s*[:=\-]?\s*([0-9]+(?:[.,][0-9]+)?)'
          ))[1],
          ',',
          '.'
        ),
        ''
      )::NUMERIC,
      NULLIF(
        REPLACE(
          (regexp_match(
            lower(COALESCE(notes, '')),
            '([0-9]+(?:[.,][0-9]+)?)\s*(?:\u20aa|nis|n\.?i\.?s|shekel|shekels|شيكل|شيقل)'
          ))[1],
          ',',
          '.'
        ),
        ''
      )::NUMERIC,
      0
    ) AS parsed_amount
  FROM public.visits
)
UPDATE public.visits v
SET paid_amount = GREATEST(extracted_payments.parsed_amount, 0)
FROM extracted_payments
WHERE v.id = extracted_payments.id
  AND COALESCE(v.paid_amount, 0) = 0
  AND extracted_payments.parsed_amount > 0;

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

CREATE INDEX IF NOT EXISTS idx_visits_paid_amount ON public.visits (paid_amount);
CREATE INDEX IF NOT EXISTS idx_visits_paid_collected_by ON public.visits (paid_collected_by);
CREATE INDEX IF NOT EXISTS idx_visits_paid_collected_at ON public.visits (paid_collected_at DESC);
