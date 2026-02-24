-- Add SpO2 field to patients for oxygen saturation percentage
ALTER TABLE public.patients
ADD COLUMN IF NOT EXISTS spo2 INTEGER
CHECK (spo2 IS NULL OR (spo2 >= 0 AND spo2 <= 100));
