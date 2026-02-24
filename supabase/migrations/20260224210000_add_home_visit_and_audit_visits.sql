-- Add home visit flag on visits and extend audit logging to include visits.

ALTER TABLE public.visits
ADD COLUMN IF NOT EXISTS is_home_visit BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_visits_is_home_visit
ON public.visits (is_home_visit);

COMMENT ON COLUMN public.visits.is_home_visit IS 'Marks whether the visit was performed at home.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'audit_logs_entity_type_check'
  ) THEN
    ALTER TABLE public.audit_logs
      DROP CONSTRAINT audit_logs_entity_type_check;
  END IF;
END
$$;

ALTER TABLE public.audit_logs
ADD CONSTRAINT audit_logs_entity_type_check
CHECK (entity_type IN ('patient', 'prescription', 'visit'));

DROP TRIGGER IF EXISTS audit_visits_changes ON public.visits;

CREATE TRIGGER audit_visits_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.capture_row_audit('visit');
