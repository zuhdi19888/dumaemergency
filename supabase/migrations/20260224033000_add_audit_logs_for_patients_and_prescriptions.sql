-- Audit log to track who created/updated patients and prescriptions
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('patient', 'prescription')),
  entity_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('insert', 'update', 'delete')),
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_fields TEXT[] NOT NULL DEFAULT '{}',
  old_values JSONB,
  new_values JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs (entity_type, entity_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_by
  ON public.audit_logs (changed_by, changed_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view audit logs" ON public.audit_logs;
CREATE POLICY "Staff can view audit logs" ON public.audit_logs
  FOR SELECT USING (
    public.is_admin() OR public.is_doctor() OR public.is_pharmacist() OR public.is_receptionist()
  );

DROP POLICY IF EXISTS "Staff can insert audit logs" ON public.audit_logs;
CREATE POLICY "Staff can insert audit logs" ON public.audit_logs
  FOR INSERT WITH CHECK (
    public.is_admin() OR public.is_doctor() OR public.is_pharmacist() OR public.is_receptionist()
  );

DROP POLICY IF EXISTS "Only admin can delete audit logs" ON public.audit_logs;
CREATE POLICY "Only admin can delete audit logs" ON public.audit_logs
  FOR DELETE USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.capture_row_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  entity_type_value TEXT := TG_ARGV[0];
  changed_by_value UUID := auth.uid();
  old_row JSONB;
  new_row JSONB;
  changed_keys TEXT[];
BEGIN
  IF TG_OP = 'INSERT' THEN
    new_row := to_jsonb(NEW) - 'updated_at';
    IF changed_by_value IS NULL THEN
      changed_by_value := COALESCE((new_row->>'created_by')::uuid, (new_row->>'doctor_id')::uuid);
    END IF;

    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      action,
      changed_by,
      changed_fields,
      old_values,
      new_values
    )
    VALUES (
      entity_type_value,
      NEW.id,
      'insert',
      changed_by_value,
      COALESCE(ARRAY(SELECT jsonb_object_keys(new_row)), '{}'),
      NULL,
      new_row
    );

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    old_row := to_jsonb(OLD) - 'updated_at';
    new_row := to_jsonb(NEW) - 'updated_at';

    SELECT COALESCE(array_agg(key), '{}')
    INTO changed_keys
    FROM (
      SELECT key FROM jsonb_object_keys(old_row) AS key
      UNION
      SELECT key FROM jsonb_object_keys(new_row) AS key
    ) keys
    WHERE old_row -> keys.key IS DISTINCT FROM new_row -> keys.key;

    IF array_length(changed_keys, 1) IS NULL THEN
      RETURN NEW;
    END IF;

    IF changed_by_value IS NULL THEN
      changed_by_value := COALESCE((new_row->>'doctor_id')::uuid, (new_row->>'created_by')::uuid);
    END IF;

    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      action,
      changed_by,
      changed_fields,
      old_values,
      new_values
    )
    VALUES (
      entity_type_value,
      NEW.id,
      'update',
      changed_by_value,
      changed_keys,
      old_row,
      new_row
    );

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    old_row := to_jsonb(OLD) - 'updated_at';
    IF changed_by_value IS NULL THEN
      changed_by_value := COALESCE((old_row->>'doctor_id')::uuid, (old_row->>'created_by')::uuid);
    END IF;

    INSERT INTO public.audit_logs (
      entity_type,
      entity_id,
      action,
      changed_by,
      changed_fields,
      old_values,
      new_values
    )
    VALUES (
      entity_type_value,
      OLD.id,
      'delete',
      changed_by_value,
      COALESCE(ARRAY(SELECT jsonb_object_keys(old_row)), '{}'),
      old_row,
      NULL
    );

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS audit_patients_changes ON public.patients;
CREATE TRIGGER audit_patients_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.capture_row_audit('patient');

DROP TRIGGER IF EXISTS audit_prescriptions_changes ON public.prescriptions;
CREATE TRIGGER audit_prescriptions_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.capture_row_audit('prescription');
