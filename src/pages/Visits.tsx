import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Edit, Loader2, Eye, Printer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Visit, Patient } from '@/types/clinic';
import { PageHeader } from '@/components/layout/PageHeader';
import { printStructuredReport } from '@/lib/printUtils';
import { calculateAge } from '@/lib/patientAge';

const currencyFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 2,
});

const isMissingPaidAmountColumnError = (message: string) =>
  /paid_amount/i.test(message) && (/does not exist/i.test(message) || /column/i.test(message));

const isMissingPaidCollectorColumnsError = (message: string) =>
  /(paid_collected_by|paid_collected_at)/i.test(message) &&
  (/does not exist/i.test(message) || /column/i.test(message) || /schema cache/i.test(message));

const parsePaidAmountFromNotes = (notes: string | null | undefined) => {
  if (!notes) return 0;
  const normalized = notes.replace(',', '.');
  const patterns = [
    /(?:paid(?:\s*amount)?|amount|price|\u0627\u0644\u0645\u0628\u0644\u063A|\u0627\u0644\u0645\u062F\u0641\u0648\u0639|\u062F\u0641\u0639)\s*[:=\-]?\s*([0-9]+(?:\.[0-9]+)?)/i,
    /([0-9]+(?:\.[0-9]+)?)\s*(?:\u20AA|nis|n\.?i\.?s|shekel|shekels|\u0634\u064A\u0643\u0644|\u0634\u064A\u0642\u0644)/i,
  ];
  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
};

const withPaidAmountInNotesFallback = (notes: string | null | undefined, paidAmount: number) => {
  const safeNotes = notes ?? '';
  if ((Number(paidAmount) || 0) <= 0) return safeNotes;
  const hasExistingPayment = /(?:paid(?:\s*amount)?|amount|price|\u0627\u0644\u0645\u0628\u0644\u063A|\u0627\u0644\u0645\u062F\u0641\u0648\u0639|\u062F\u0641\u0639)\s*[:=\-]?\s*[0-9]/i.test(
    safeNotes,
  );
  if (hasExistingPayment) return safeNotes;
  const amountText = Number(paidAmount).toFixed(2).replace(/\.00$/, '');
  const paymentLine = `price: ${amountText} nis`;
  return safeNotes ? `${safeNotes}\n${paymentLine}` : paymentLine;
};

const chunkArray = <T,>(items: T[], chunkSize: number): T[][] => {
  if (chunkSize <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

type ProfileLookup = {
  id: string;
  full_name: string | null;
  email: string;
};

type AuditLogEntry = {
  id: string;
  entity_type: 'patient' | 'prescription' | 'visit';
  entity_id: string;
  action: 'insert' | 'update' | 'delete';
  changed_by: string | null;
  changed_at: string;
  changed_fields: string[];
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  actor?: ProfileLookup | null;
};

type PatientHistoryPrescription = {
  id: string;
  visit_id: string;
  prescription_date: string;
  status: string;
  notes: string | null;
};

export default function Visits() {
  const { user, profile, hasRole } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingVisit, setEditingVisit] = useState<Visit | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [viewingVisit, setViewingVisit] = useState<Visit | null>(null);
  const [visitCollectorNames, setVisitCollectorNames] = useState<Record<string, string>>({});
  const [visitAuditLogs, setVisitAuditLogs] = useState<AuditLogEntry[]>([]);
  const [patientHistoryVisits, setPatientHistoryVisits] = useState<Visit[]>([]);
  const [patientHistoryPrescriptions, setPatientHistoryPrescriptions] = useState<PatientHistoryPrescription[]>([]);
  const [isLoadingPatientHistory, setIsLoadingPatientHistory] = useState(false);
  const [isPaidAmountColumnAvailable, setIsPaidAmountColumnAvailable] = useState(true);
  const [paidAmountWarningShown, setPaidAmountWarningShown] = useState(false);

  const [formData, setFormData] = useState({
    patient_id: '',
    visit_date: new Date().toISOString().slice(0, 16),
    is_home_visit: false,
    chief_complaint: '',
    diagnosis: '',
    notes: '',
    paid_amount: '0',
    status: 'pending' as 'pending' | 'in_progress' | 'completed' | 'cancelled',
    vitals: {
      blood_pressure: '',
      temperature: '',
      pulse: '',
      weight: '',
      height: '',
      spo2: '',
    },
  });

  useEffect(() => {
    fetchVisits();
    fetchPatients();
  }, []);

  const fetchCollectorNames = async (visitsList: Visit[]) => {
    const collectorIds = Array.from(
      new Set(
        visitsList
          .map((visit) => visit.paid_collected_by || visit.doctor_id || visit.created_by)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    if (collectorIds.length === 0) {
      setVisitCollectorNames({});
      return;
    }

    const idChunks = chunkArray(collectorIds, 25);
    const profileMap: Record<string, ProfileLookup> = {};

    for (const idsChunk of idChunks) {
      const result = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', idsChunk);

      if (result.error) {
        setVisitCollectorNames({});
        return;
      }

      for (const profile of ((result.data ?? []) as ProfileLookup[])) {
        profileMap[profile.id] = profile;
      }
    }

    const collectorNames = visitsList.reduce<Record<string, string>>((acc, visit) => {
      const collectorId = visit.paid_collected_by || visit.doctor_id || visit.created_by;
      if (!collectorId) {
        acc[visit.id] = t('غير محدد', 'Unassigned');
        return acc;
      }
      const profile = profileMap[collectorId];
      acc[visit.id] = profile?.full_name || profile?.email || t('غير محدد', 'Unassigned');
      return acc;
    }, {});

    setVisitCollectorNames(collectorNames);
  };

  const fetchVisitAuditLogs = async (visitId: string) => {
    const logsRes = await (supabase as any)
      .from('audit_logs')
      .select('*')
      .eq('entity_type', 'visit')
      .eq('entity_id', visitId)
      .order('changed_at', { ascending: false });

    if (logsRes.error) {
      setVisitAuditLogs([]);
      return;
    }

    const logs = (logsRes.data ?? []) as AuditLogEntry[];
    const actorIds = Array.from(new Set(logs.map((log) => log.changed_by).filter(Boolean) as string[]));
    if (actorIds.length === 0) {
      setVisitAuditLogs(logs);
      return;
    }

    const actorsRes = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', actorIds);

    if (actorsRes.error) {
      setVisitAuditLogs(logs);
      return;
    }

    const actorMap = ((actorsRes.data ?? []) as ProfileLookup[]).reduce<Record<string, ProfileLookup>>(
      (acc, actor) => {
        acc[actor.id] = actor;
        return acc;
      },
      {},
    );

    setVisitAuditLogs(
      logs.map((log) => ({
        ...log,
        actor: log.changed_by ? actorMap[log.changed_by] ?? null : null,
      })),
    );
  };

  const fetchPatientMedicalHistory = async (patientId: string) => {
    if (!patientId) {
      setPatientHistoryVisits([]);
      setPatientHistoryPrescriptions([]);
      return;
    }

    setIsLoadingPatientHistory(true);
    const historyVisits = visits
      .filter((visit) => visit.patient_id === patientId)
      .sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());
    setPatientHistoryVisits(historyVisits);

    const visitIds = historyVisits.map((visit) => visit.id);
    if (visitIds.length === 0) {
      setPatientHistoryPrescriptions([]);
      setIsLoadingPatientHistory(false);
      return;
    }

    const idChunks = chunkArray(visitIds, 25);
    const prescriptionsRows: PatientHistoryPrescription[] = [];

    for (const idsChunk of idChunks) {
      const result = await supabase
        .from('prescriptions')
        .select('id, visit_id, prescription_date, status, notes')
        .in('visit_id', idsChunk)
        .order('prescription_date', { ascending: false });

      if (result.error) {
        setPatientHistoryPrescriptions([]);
        setIsLoadingPatientHistory(false);
        return;
      }

      prescriptionsRows.push(...((result.data ?? []) as PatientHistoryPrescription[]));
    }

    prescriptionsRows.sort(
      (a, b) => new Date(b.prescription_date).getTime() - new Date(a.prescription_date).getTime(),
    );
    setPatientHistoryPrescriptions(prescriptionsRows);
    setIsLoadingPatientHistory(false);
  };

  useEffect(() => {
    if (!isDialogOpen || !formData.patient_id) return;
    void fetchPatientMedicalHistory(formData.patient_id);
  }, [isDialogOpen, formData.patient_id, visits]);

  const showPaidAmountNotice = () => {
    if (paidAmountWarningShown) return;
    setPaidAmountWarningShown(true);
    toast({
      title: t('تنبيه', 'Notice'),
      description: t(
        'تم حفظ الدفعة داخل الملاحظات لأن عمود paid_amount غير موجود في قاعدة البيانات.',
        'Payment was saved in notes because paid_amount column is missing in the database.',
      ),
    });
  };

  const fetchVisits = async () => {
    setIsLoading(true);

    let paidAmountAvailable = true;

    const paidAmountProbe = await supabase
      .from('visits')
      .select('*')
      .limit(1);

    if (paidAmountProbe.error && isMissingPaidAmountColumnError(paidAmountProbe.error.message)) {
      paidAmountAvailable = false;
      setIsPaidAmountColumnAvailable(false);
    } else {
      const firstRow = (paidAmountProbe.data ?? [])[0] as Record<string, unknown> | undefined;
      if (!firstRow) {
        paidAmountAvailable = true;
        setIsPaidAmountColumnAvailable(true);
      } else {
        paidAmountAvailable = Object.prototype.hasOwnProperty.call(firstRow, 'paid_amount');
        setIsPaidAmountColumnAvailable(paidAmountAvailable);
      }
    }

    const { data, error } = await supabase
      .from('visits')
      .select(`
        *,
        patient:patients(id, first_name, last_name, date_of_birth)
      `)
      .order('visit_date', { ascending: false });

    if (error) {
      toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: error.message });
    } else {
      const normalizedVisits = ((data ?? []) as any[]).map((visit) => ({
        ...visit,
        is_home_visit: Boolean(visit.is_home_visit),
        paid_amount: paidAmountAvailable
          ? Number(visit.paid_amount) || 0
          : parsePaidAmountFromNotes(visit.notes),
      }));
      setVisits(normalizedVisits as Visit[]);
      await fetchCollectorNames(normalizedVisits as Visit[]);
    }
    setIsLoading(false);
  };

  const fetchPatients = async () => {
    const { data } = await supabase
      .from('patients')
      .select('id, first_name, last_name')
      .order('last_name');
    if (data) setPatients(data as Patient[]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const normalizedPaidAmount = hasRole(['admin', 'doctor', 'receptionist'])
      ? Math.max(0, Number(formData.paid_amount) || 0)
      : 0;

    const { paid_amount: _ignoredPaidAmount, ...formDataWithoutPaidAmount } = formData;

    const notesWithFallback = isPaidAmountColumnAvailable
      ? formDataWithoutPaidAmount.notes
      : withPaidAmountInNotesFallback(formDataWithoutPaidAmount.notes, normalizedPaidAmount);

    const baseVisitData = {
      ...formDataWithoutPaidAmount,
      notes: notesWithFallback,
      doctor_id: user?.id,
      created_by: user?.id,
    };

    const visitData = isPaidAmountColumnAvailable
      ? {
          ...baseVisitData,
          paid_amount: normalizedPaidAmount,
          ...(normalizedPaidAmount > 0
            ? {
                paid_collected_by: user?.id ?? null,
                paid_collected_at: new Date().toISOString(),
              }
            : {}),
        }
      : baseVisitData;

    let error;
    if (editingVisit) {
      const { error: updateError } = await supabase.from('visits').update(visitData).eq('id', editingVisit.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('visits').insert([visitData]);
      error = insertError;
    }

    if (error && isMissingPaidCollectorColumnsError(error.message) && isPaidAmountColumnAvailable) {
      const legacyVisitData = { ...baseVisitData, paid_amount: normalizedPaidAmount };
      if (editingVisit) {
        const { error: retryUpdateError } = await supabase
          .from('visits')
          .update(legacyVisitData)
          .eq('id', editingVisit.id);
        error = retryUpdateError;
      } else {
        const { error: retryInsertError } = await supabase.from('visits').insert([legacyVisitData]);
        error = retryInsertError;
      }
    }

    if (error && isMissingPaidAmountColumnError(error.message)) {
      setIsPaidAmountColumnAvailable(false);
      showPaidAmountNotice();
      if (editingVisit) {
        const { error: retryUpdateError } = await supabase
          .from('visits')
          .update(baseVisitData)
          .eq('id', editingVisit.id);
        error = retryUpdateError;
      } else {
        const { error: retryInsertError } = await supabase.from('visits').insert([baseVisitData]);
        error = retryInsertError;
      }
    }

    if (error) {
      toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: error.message });
    } else {
      toast({ title: t('تم بنجاح', 'Success'), description: editingVisit ? t('تم تحديث الزيارة بنجاح', 'Visit updated successfully') : t('تم إنشاء الزيارة بنجاح', 'Visit created successfully') });
      resetForm();
      setIsDialogOpen(false);
      fetchVisits();
    }
    setIsSaving(false);
  };

  const handleEdit = (visit: Visit) => {
    setEditingVisit(visit);
    setFormData({
      patient_id: visit.patient_id,
      visit_date: new Date(visit.visit_date).toISOString().slice(0, 16),
      chief_complaint: visit.chief_complaint || '',
      diagnosis: visit.diagnosis || '',
      notes: visit.notes || '',
      paid_amount: String(Number(visit.paid_amount) || 0),
      status: visit.status,
      vitals: {
        blood_pressure: visit.vitals?.blood_pressure || '',
        temperature: visit.vitals?.temperature || '',
        pulse: visit.vitals?.pulse || '',
        weight: visit.vitals?.weight || '',
        height: visit.vitals?.height || '',
        spo2: visit.vitals?.spo2 || '',
      },
    });
    setIsDialogOpen(true);
  };

  const resetForm = () => {
    setEditingVisit(null);
    setFormData({
      patient_id: '',
      visit_date: new Date().toISOString().slice(0, 16),
      chief_complaint: '',
      diagnosis: '',
      notes: '',
      paid_amount: '0',
      status: 'pending',
      vitals: {
        blood_pressure: '',
        temperature: '',
        pulse: '',
        weight: '',
        height: '',
        spo2: '',
      },
    });
  };

  const filteredVisits = visits.filter((v) => {
    const patientName = `${(v as any).patient?.first_name} ${(v as any).patient?.last_name}`.toLowerCase();
    return (
      patientName.includes(searchQuery.toLowerCase()) ||
      v.chief_complaint?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.diagnosis?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const getStatusLabel = (status: Visit['status']) => {
    if (status === 'completed') return t('مكتملة', 'Completed');
    if (status === 'cancelled') return t('ملغاة', 'Cancelled');
    if (status === 'in_progress') return t('قيد التنفيذ', 'In Progress');
    return t('قيد الانتظار', 'Pending');
  };

  const handlePrintVisit = (visit: Visit) => {
    const patientName = `${(visit as any).patient?.first_name ?? ''} ${(visit as any).patient?.last_name ?? ''}`.trim() || '-';
    const patientDob = (visit as any).patient?.date_of_birth as string | null | undefined;
    const patientAge = calculateAge(patientDob);
    const printedByDoctorName =
      profile?.full_name ||
      (typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '') ||
      user?.email ||
      t('غير معروف', 'Unknown');

    printStructuredReport({
      reportTitle: 'medical report',
      reportSubTitle: patientName,
      doctorSignatureName: printedByDoctorName,
      rows: [
        { label: t('المريض', 'Patient'), value: patientName },
        { label: t('التاريخ', 'Date'), value: new Date(visit.visit_date).toLocaleString() },
        {
          label: t('تاريخ الميلاد', 'Date of Birth'),
          value: patientDob ? new Date(patientDob).toLocaleDateString() : '-',
        },
        {
          label: t('العمر', 'Age'),
          value: patientAge !== null && patientAge !== undefined ? String(patientAge) : '-',
        },
        { label: t('الحالة', 'Status'), value: getStatusLabel(visit.status) },
        { label: t('المدفوع', 'Paid'), value: currencyFormatter.format(Number(visit.paid_amount) || 0) },
      ],
      sections: [
        {
          title: t('التفاصيل الطبية', 'Medical Details'),
          rows: [
            { label: t('الشكوى الرئيسية', 'Chief Complaint'), value: visit.chief_complaint || '-' },
            { label: t('التشخيص', 'Diagnosis'), value: visit.diagnosis || '-' },
            { label: t('الملاحظات', 'Notes'), value: visit.notes || '-' },
          ],
        },
        {
          title: t('العلامات الحيوية', 'Vitals'),
          rows: [
            { label: t('الضغط', 'Blood Pressure'), value: visit.vitals?.blood_pressure || '-' },
            { label: t('الحرارة', 'Temperature'), value: visit.vitals?.temperature || '-' },
            { label: t('النبض', 'Pulse'), value: visit.vitals?.pulse || '-' },
            { label: t('الوزن', 'Weight'), value: visit.vitals?.weight || '-' },
            { label: t('الطول', 'Height'), value: visit.vitals?.height || '-' },
            { label: 'SpO2', value: visit.vitals?.spo2 || '-' },
          ],
        },
        {
          title: t('تفاصيل الدفع', 'Payment Details'),
          rows: [
            { label: t('نوع الدفع', 'Payment Type'), value: t('دفع زيارة مريض', 'Patient visit payment') },
            { label: t('المبلغ المدفوع', 'Paid Amount'), value: currencyFormatter.format(Number(visit.paid_amount) || 0) },
            { label: t('تاريخ الدفع', 'Payment Date'), value: new Date(visit.visit_date).toLocaleString() },
          ],
        },
      ],
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('الزيارات', 'Visits')}
        subtitle={t('إدارة زيارات المرضى والاستشارات', 'Manage patient visits and consultations')}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="ml-2 h-4 w-4" />
              {t('طباعة التقرير', 'Print Report')}
            </Button>
            {hasRole(['admin', 'doctor', 'receptionist']) && (
              <Dialog
                open={isDialogOpen}
                onOpenChange={(open) => {
                  setIsDialogOpen(open);
                  if (!open) resetForm();
                }}
              >
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="ml-2 h-4 w-4" />
                    {t('زيارة جديدة', 'New Visit')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>
                      {editingVisit ? t('تعديل زيارة', 'Edit Visit') : t('زيارة جديدة', 'New Visit')}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="patient_id">{t('المريض *', 'Patient *')}</Label>
                  <Select
                    value={formData.patient_id}
                    onValueChange={(value) => setFormData({ ...formData, patient_id: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('اختر المريض', 'Select patient')} />
                    </SelectTrigger>
                    <SelectContent>
                      {patients.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.first_name} {p.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="visit_date">{t('تاريخ الزيارة *', 'Visit Date *')}</Label>
                    <Input
                      id="visit_date"
                      type="datetime-local"
                      value={formData.visit_date}
                      onChange={(e) => setFormData({ ...formData, visit_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="status">{t('الحالة', 'Status')}</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value: 'pending' | 'in_progress' | 'completed' | 'cancelled') =>
                        setFormData({ ...formData, status: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">{t('قيد الانتظار', 'Pending')}</SelectItem>
                        <SelectItem value="in_progress">{t('قيد التنفيذ', 'In Progress')}</SelectItem>
                        <SelectItem value="completed">{t('مكتملة', 'Completed')}</SelectItem>
                        <SelectItem value="cancelled">{t('ملغاة', 'Cancelled')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chief_complaint">{t('الشكوى الرئيسية', 'Chief Complaint')}</Label>
                  <Textarea
                    id="chief_complaint"
                    value={formData.chief_complaint}
                    onChange={(e) => setFormData({ ...formData, chief_complaint: e.target.value })}
                    placeholder={t('الشكوى الأساسية للمريض...', "Patient's main complaint...")}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('العلامات الحيوية', 'Vitals')}</Label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      placeholder={t('ضغط الدم (مثال: 120/80)', 'Blood Pressure (e.g., 120/80)')}
                      value={formData.vitals.blood_pressure}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          vitals: { ...formData.vitals, blood_pressure: e.target.value },
                        })
                      }
                    />
                    <Input
                      placeholder={t('الحرارة (°م)', 'Temperature (°C)')}
                      value={formData.vitals.temperature}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          vitals: { ...formData.vitals, temperature: e.target.value },
                        })
                      }
                    />
                    <Input
                      placeholder={t('النبض (bpm)', 'Pulse (bpm)')}
                      value={formData.vitals.pulse}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          vitals: { ...formData.vitals, pulse: e.target.value },
                        })
                      }
                    />
                    <Input
                      placeholder={t('الوزن (كغ)', 'Weight (kg)')}
                      value={formData.vitals.weight}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          vitals: { ...formData.vitals, weight: e.target.value },
                        })
                      }
                    />
                    <Input
                      placeholder={t('نسبة الأكسجة SpO2 (%)', 'SpO2 (%)')}
                      value={formData.vitals.spo2}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          vitals: { ...formData.vitals, spo2: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="diagnosis">{t('التشخيص', 'Diagnosis')}</Label>
                  <Textarea
                    id="diagnosis"
                    value={formData.diagnosis}
                    onChange={(e) => setFormData({ ...formData, diagnosis: e.target.value })}
                    placeholder={t('أدخل التشخيص...', 'Diagnosis...')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">{t('ملاحظات', 'Notes')}</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder={t('ملاحظات إضافية...', 'Additional notes...')}
                  />
                </div>

                {hasRole(['admin', 'doctor', 'receptionist']) && (
                  <div className="space-y-2">
                    <Label htmlFor="paid_amount">{t('المبلغ المدفوع', 'Paid Amount')}</Label>
                    <Input
                      id="paid_amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.paid_amount}
                      onChange={(e) => setFormData({ ...formData, paid_amount: e.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                )}
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    {t('إلغاء', 'Cancel')}
                  </Button>
                  <Button type="submit" disabled={isSaving}>
                    {isSaving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                    {editingVisit ? t('تحديث', 'Update') : t('إضافة', 'Create')}
                  </Button>
                </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('ابحث عن زيارة...', 'Search visits...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pr-9"
        />
      </div>

      <div className="table-container">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('المريض', 'Patient')}</TableHead>
              <TableHead>{t('التاريخ', 'Date')}</TableHead>
              <TableHead>{t('الشكوى الرئيسية', 'Chief Complaint')}</TableHead>
              <TableHead>{t('التشخيص', 'Diagnosis')}</TableHead>
              <TableHead>{t('الحالة', 'Status')}</TableHead>
              <TableHead className="text-right">{t('الإجراءات', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredVisits.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  {t('لا توجد زيارات', 'No visits found')}
                </TableCell>
              </TableRow>
            ) : (
              filteredVisits.map((visit) => (
                <TableRow key={visit.id}>
                  <TableCell className="font-medium">
                    {(visit as any).patient?.first_name} {(visit as any).patient?.last_name}
                  </TableCell>
                  <TableCell>
                    {new Date(visit.visit_date).toLocaleString()}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {visit.chief_complaint || '-'}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {visit.diagnosis || '-'}
                  </TableCell>
                  <TableCell>
                    <span className={`status-badge ${
                      visit.status === 'completed' ? 'status-completed' :
                      visit.status === 'cancelled' ? 'status-cancelled' :
                      visit.status === 'in_progress' ? 'bg-info/10 text-info' :
                      'status-pending'
                    }`}>
                      {getStatusLabel(visit.status)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handlePrintVisit(visit)}
                        title={t('طباعة الزيارة', 'Print visit')}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setViewingVisit(visit)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {hasRole(['admin', 'doctor']) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(visit)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!viewingVisit} onOpenChange={() => setViewingVisit(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('تفاصيل الزيارة', 'Visit Details')}</DialogTitle>
          </DialogHeader>
          {viewingVisit && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">{t('المريض', 'Patient')}</p>
                  <p className="font-medium">
                    {(viewingVisit as any).patient?.first_name} {(viewingVisit as any).patient?.last_name}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('التاريخ', 'Date')}</p>
                  <p className="font-medium">
                    {new Date(viewingVisit.visit_date).toLocaleString()}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('الشكوى الرئيسية', 'Chief Complaint')}</p>
                <p className="font-medium">{viewingVisit.chief_complaint || '-'}</p>
              </div>
              {viewingVisit.vitals && Object.keys(viewingVisit.vitals).length > 0 && (
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">{t('العلامات الحيوية', 'Vitals')}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {viewingVisit.vitals.blood_pressure && (
                      <p><span className="text-muted-foreground">{t('الضغط:', 'BP:')}</span> {viewingVisit.vitals.blood_pressure}</p>
                    )}
                    {viewingVisit.vitals.temperature && (
                      <p><span className="text-muted-foreground">{t('الحرارة:', 'Temp:')}</span> {viewingVisit.vitals.temperature}°C</p>
                    )}
                    {viewingVisit.vitals.pulse && (
                      <p><span className="text-muted-foreground">{t('النبض:', 'Pulse:')}</span> {viewingVisit.vitals.pulse} bpm</p>
                    )}
                    {viewingVisit.vitals.weight && (
                      <p><span className="text-muted-foreground">{t('الوزن:', 'Weight:')}</span> {viewingVisit.vitals.weight} kg</p>
                    )}
                    {viewingVisit.vitals.spo2 && (
                      <p><span className="text-muted-foreground">SpO2:</span> {viewingVisit.vitals.spo2}%</p>
                    )}
                  </div>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">{t('التشخيص', 'Diagnosis')}</p>
                <p className="font-medium">{viewingVisit.diagnosis || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('الملاحظات', 'Notes')}</p>
                <p className="font-medium">{viewingVisit.notes || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('المبلغ المدفوع', 'Paid Amount')}</p>
                <p className="font-medium text-success">
                  {currencyFormatter.format(Number((viewingVisit as any).paid_amount) || 0)}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

