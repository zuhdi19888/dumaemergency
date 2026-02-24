-- Support prescribing medicines that are not available in local inventory
ALTER TABLE public.prescription_items
  ADD COLUMN IF NOT EXISTS is_external_purchase BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS external_medicine_name TEXT;

ALTER TABLE public.prescription_items
  ALTER COLUMN medicine_id DROP NOT NULL;

ALTER TABLE public.prescription_items
  DROP CONSTRAINT IF EXISTS prescription_items_medicine_or_external_chk;

ALTER TABLE public.prescription_items
  ADD CONSTRAINT prescription_items_medicine_or_external_chk
  CHECK (
    (
      COALESCE(is_external_purchase, false) = true
      AND medicine_id IS NULL
      AND NULLIF(BTRIM(COALESCE(external_medicine_name, '')), '') IS NOT NULL
    )
    OR (
      COALESCE(is_external_purchase, false) = false
      AND medicine_id IS NOT NULL
      AND NULLIF(BTRIM(COALESCE(external_medicine_name, '')), '') IS NULL
    )
  );

-- Ignore external purchase items during dispensing stock deduction
CREATE OR REPLACE FUNCTION public.dispense_prescription(_prescription_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
BEGIN
  -- Check if user is admin or pharmacist
  IF NOT (public.is_admin() OR public.is_pharmacist()) THEN
    RAISE EXCEPTION 'Unauthorized: Only admin or pharmacist can dispense';
  END IF;

  -- Check if prescription exists and is pending
  IF NOT EXISTS (
    SELECT 1 FROM public.prescriptions
    WHERE id = _prescription_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Prescription not found or already dispensed';
  END IF;

  -- Loop through local-stock items and deduct stock
  FOR item IN
    SELECT pi.medicine_id, pi.quantity, m.stock_quantity, m.name
    FROM public.prescription_items pi
    JOIN public.medicines m ON m.id = pi.medicine_id
    WHERE pi.prescription_id = _prescription_id
      AND COALESCE(pi.is_external_purchase, false) = false
      AND pi.medicine_id IS NOT NULL
  LOOP
    -- Check if enough stock
    IF item.stock_quantity < item.quantity THEN
      RAISE EXCEPTION 'Insufficient stock for medicine: %', item.name;
    END IF;

    -- Deduct stock
    UPDATE public.medicines
    SET stock_quantity = stock_quantity - item.quantity,
        updated_at = now()
    WHERE id = item.medicine_id;

    -- Log transaction
    INSERT INTO public.inventory_transactions (
      medicine_id, quantity_change, transaction_type, reference_id, performed_by, notes
    ) VALUES (
      item.medicine_id, -item.quantity, 'dispensed', _prescription_id, auth.uid(),
      'Dispensed for prescription ' || _prescription_id::text
    );
  END LOOP;

  -- Update prescription status
  UPDATE public.prescriptions
  SET status = 'dispensed',
      dispensed_by = auth.uid(),
      dispensed_at = now(),
      updated_at = now()
  WHERE id = _prescription_id;

  RETURN TRUE;
END;
$$;
