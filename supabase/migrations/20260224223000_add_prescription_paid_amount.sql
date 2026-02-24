-- Store paid amount directly on prescriptions as well.
ALTER TABLE public.prescriptions
ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10, 2) NOT NULL DEFAULT 0;

UPDATE public.prescriptions p
SET paid_amount = COALESCE(v.paid_amount, 0)
FROM public.visits v
WHERE p.visit_id = v.id
  AND COALESCE(p.paid_amount, 0) = 0
  AND COALESCE(v.paid_amount, 0) > 0;

ALTER TABLE public.prescriptions
DROP CONSTRAINT IF EXISTS prescriptions_paid_amount_non_negative;

ALTER TABLE public.prescriptions
ADD CONSTRAINT prescriptions_paid_amount_non_negative CHECK (paid_amount >= 0);

CREATE INDEX IF NOT EXISTS idx_prescriptions_paid_amount
ON public.prescriptions (paid_amount);

COMMENT ON COLUMN public.prescriptions.paid_amount IS 'Amount paid for this prescription.';
