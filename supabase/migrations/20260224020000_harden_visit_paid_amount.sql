-- Ensure paid_amount is fully enforced for visits and all financial reports
ALTER TABLE public.visits
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10, 2);

UPDATE public.visits
SET paid_amount = 0
WHERE paid_amount IS NULL;

ALTER TABLE public.visits
ALTER COLUMN paid_amount SET DEFAULT 0,
ALTER COLUMN paid_amount SET NOT NULL;

ALTER TABLE public.visits
DROP CONSTRAINT IF EXISTS visits_paid_amount_check;

ALTER TABLE public.visits
DROP CONSTRAINT IF EXISTS visits_paid_amount_non_negative;

ALTER TABLE public.visits
ADD CONSTRAINT visits_paid_amount_non_negative CHECK (paid_amount >= 0);

CREATE INDEX IF NOT EXISTS idx_visits_paid_amount
ON public.visits (paid_amount);

CREATE INDEX IF NOT EXISTS idx_visits_visit_date_paid_amount
ON public.visits (visit_date DESC, paid_amount);

COMMENT ON COLUMN public.visits.paid_amount IS 'Amount paid by patient per visit, in ILS.';
