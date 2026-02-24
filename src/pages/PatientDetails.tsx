import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, ClipboardList, FileText, Printer } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import type { Patient, Visit, Prescription } from '@/types/clinic';
import { calculateAge } from '@/lib/patientAge';

type VisitWithPrescriptionFlag = Visit & { hasPrescription?: boolean };
type ProfileLookup = { id: string; full_name: string | null; email: string };
type AuditLogEntry = {
  id: string;
  entity_type: 'patient' | 'prescription';
  entity_id: string;
  action: 'insert' | 'update' | 'delete';
  changed_by: string | null;
  changed_at: string;
  changed_fields: string[];
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  actor?: ProfileLookup | null;
};

export default function PatientDetails() {
  const { id } = useParams();
  const { toast } = useToast();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [visits, setVisits] = useState<VisitWithPrescriptionFlag[]>([]);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [creatorProfile, setCreatorProfile] = useState<ProfileLookup | null>(null);
  const [activityLogs, setActivityLogs] = useState<AuditLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    void fetchData(id);
  }, [id]);

  const fetchData = async (patientId: string) => {
    setIsLoading(true);
    try {
      const patientRes = await supabase.from('patients').select('*').eq('id', patientId).single();
      if (patientRes.error) throw patientRes.error;
      const patientRow = patientRes.data as Patient;
      setPatient(patientRow);

      if (patientRow.created_by) {
        const creatorRes = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('id', patientRow.created_by)
          .maybeSingle();
        if (!creatorRes.error && creatorRes.data) {
          setCreatorProfile(creatorRes.data as ProfileLookup);
        } else {
          setCreatorProfile(null);
        }
      } else {
        setCreatorProfile(null);
      }

      const visitsRes = await supabase
        .from('visits')
        .select('*')
        .eq('patient_id', patientId)
        .order('visit_date', { ascending: false });
      if (visitsRes.error) throw visitsRes.error;
      const visitRows = (visitsRes.data as Visit[]) ?? [];

      const visitIds = visitRows.map((visit) => visit.id);
      let prescriptionRows: Prescription[] = [];
      if (visitIds.length > 0) {
        const prescriptionsRes = await supabase
          .from('prescriptions')
          .select('*')
          .in('visit_id', visitIds)
          .order('prescription_date', { ascending: false });
        if (prescriptionsRes.error) throw prescriptionsRes.error;
        prescriptionRows = (prescriptionsRes.data as Prescription[]) ?? [];
      }
      setPrescriptions(prescriptionRows);

      const prescriptionVisitIds = new Set(prescriptionRows.map((prescription) => prescription.visit_id));
      setVisits(
        visitRows.map((visit) => ({
          ...visit,
          hasPrescription: prescriptionVisitIds.has(visit.id),
        })),
      );

      const [patientLogsRes, prescriptionLogsRes] = await Promise.all([
        (supabase as any)
          .from('audit_logs')
          .select('*')
          .eq('entity_type', 'patient')
          .eq('entity_id', patientId)
          .order('changed_at', { ascending: false }),
        prescriptionRows.length > 0
          ? (supabase as any)
              .from('audit_logs')
              .select('*')
              .eq('entity_type', 'prescription')
              .in('entity_id', prescriptionRows.map((item) => item.id))
              .order('changed_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (patientLogsRes.error) {
        throw patientLogsRes.error;
      }
      if (prescriptionLogsRes.error) {
        throw prescriptionLogsRes.error;
      }

      const logs = [
        ...((patientLogsRes.data ?? []) as AuditLogEntry[]),
        ...((prescriptionLogsRes.data ?? []) as AuditLogEntry[]),
      ].sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());

      const actorIds = Array.from(new Set(logs.map((log) => log.changed_by).filter(Boolean) as string[]));
      let actorMap: Record<string, ProfileLookup> = {};

      if (actorIds.length > 0) {
        const actorsRes = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', actorIds);
        if (!actorsRes.error) {
          actorMap = ((actorsRes.data ?? []) as ProfileLookup[]).reduce<Record<string, ProfileLookup>>(
            (acc, actor) => {
              acc[actor.id] = actor;
              return acc;
            },
            {},
          );
        }
      }

      setActivityLogs(
        logs.map((log) => ({
          ...log,
          actor: log.changed_by ? actorMap[log.changed_by] ?? null : null,
        })),
      );
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to fetch patient details.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const stats = useMemo(
    () => ({
      visits: visits.length,
      prescriptions: prescriptions.length,
      latestVisit: visits[0]?.visit_date ?? null,
    }),
    [visits, prescriptions],
  );

  const formatFieldLabel = (field: string) => field.replaceAll('_', ' ');

  const formatAuditValue = (value: unknown) => {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'object') {
      const stringified = JSON.stringify(value);
      return stringified.length > 80 ? `${stringified.slice(0, 80)}...` : stringified;
    }
    const asString = String(value);
    return asString.length > 80 ? `${asString.slice(0, 80)}...` : asString;
  };

  const getActionLabel = (entry: AuditLogEntry) => {
    if (entry.entity_type === 'patient' && entry.action === 'insert') return 'Patient Added';
    if (entry.entity_type === 'patient' && entry.action === 'update') return 'Patient Updated';
    if (entry.entity_type === 'prescription' && entry.action === 'insert') return 'Prescription Added';
    if (entry.entity_type === 'prescription' && entry.action === 'update') return 'Prescription Updated';
    if (entry.action === 'delete') return 'Record Deleted';
    return 'Record Changed';
  };

  const getActorLabel = (entry: AuditLogEntry) =>
    entry.actor?.full_name || entry.actor?.email || entry.changed_by || 'System';

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading patient details...</p>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="space-y-4">
        <Link to="/patients">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Patients
          </Button>
        </Link>
        <Card>
          <CardContent className="p-8 text-center">
            <h2 className="text-xl font-semibold">Patient Not Found</h2>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={`${patient.first_name} ${patient.last_name}`}
        subtitle="Patient profile and history"
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print Report
            </Button>
            <Link to="/patients">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Visits</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-2xl font-bold">{stats.visits}</p>
            <ClipboardList className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Prescriptions</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-2xl font-bold">{stats.prescriptions}</p>
            <FileText className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
        <Card className="stat-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Latest Visit</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              {stats.latestVisit ? new Date(stats.latestVisit).toLocaleDateString() : 'No visits'}
            </p>
            <CalendarDays className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Patient Information</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground">Date of Birth</p>
            <p>{patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString() : '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Age</p>
            <p>{calculateAge(patient.date_of_birth) ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Gender</p>
            <p className="capitalize">{patient.gender ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Phone</p>
            <p>{patient.phone ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p>{patient.email ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Blood Type</p>
            <p>{patient.blood_type ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">SpO2</p>
            <p>{patient.spo2 !== null && patient.spo2 !== undefined ? `${patient.spo2}%` : '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Address</p>
            <p>{patient.address ?? '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Added By</p>
            <p>{creatorProfile?.full_name || creatorProfile?.email || patient.created_by || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Added At</p>
            <p>{new Date(patient.created_at).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          {activityLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet</p>
          ) : (
            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {activityLogs.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium">{getActionLabel(entry)}</p>
                    <p className="text-xs text-muted-foreground">{new Date(entry.changed_at).toLocaleString()}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">By: {getActorLabel(entry)}</p>
                  {entry.changed_fields?.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {entry.changed_fields.slice(0, 8).map((field) => (
                        <p key={`${entry.id}-${field}`} className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground">{formatFieldLabel(field)}:</span>{' '}
                          {formatAuditValue(entry.old_values?.[field])} {' -> '}{formatAuditValue(entry.new_values?.[field])}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Visit History</CardTitle>
        </CardHeader>
        <CardContent className="table-container p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Complaint</TableHead>
                <TableHead>Diagnosis</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Prescription</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visits.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No visits available
                  </TableCell>
                </TableRow>
              ) : (
                visits.map((visit) => (
                  <TableRow key={visit.id}>
                    <TableCell>{new Date(visit.visit_date).toLocaleDateString()}</TableCell>
                    <TableCell>{visit.chief_complaint || '-'}</TableCell>
                    <TableCell>{visit.diagnosis || '-'}</TableCell>
                    <TableCell>
                      <span className="status-badge capitalize status-pending">
                        {visit.status.replace('_', ' ')}
                      </span>
                    </TableCell>
                    <TableCell>{visit.hasPrescription ? 'Yes' : 'No'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
