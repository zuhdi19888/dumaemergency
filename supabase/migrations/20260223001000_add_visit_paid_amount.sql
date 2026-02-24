-- Add paid amount on each visit (medical report) to track patient payments
ALTER TABLE public.visits
ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0
CHECK (paid_amount >= 0);
