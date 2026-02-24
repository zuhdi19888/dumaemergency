import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { Plus, Search, Edit, Trash2, Loader2, Printer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Patient } from '@/types/clinic';
import { PageHeader } from '@/components/layout/PageHeader';
import { calculateAge } from '@/lib/patientAge';
import { printStructuredReport } from '@/lib/printUtils';

const currencyFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 2,
});

const isMissingPaidAmountColumnError = (message: string) =>
  /paid_amount/i.test(message) && (/does not exist/i.test(message) || /column/i.test(message));

type PatientPaymentDetail = {
  visit_date: string;
  paid_amount: number;
  status?: string | null;
  chief_complaint?: string | null;
  diagnosis?: string | null;
};

export default function Patients() {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientPaidTotals, setPatientPaidTotals] = useState<Record<string, number>>({});
  const [patientPaymentDetails, setPatientPaymentDetails] = useState<Record<string, PatientPaymentDetail[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '' as 'male' | 'female' | 'other' | '',
    phone: '',
    email: '',
    address: '',
    blood_type: '',
    spo2: '',
    allergies: '',
    notes: '',
  });

  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    setIsLoading(true);
    const [patientsResult, paymentsResult] = await Promise.all([
      supabase.from('patients').select('*').order('created_at', { ascending: false }),
      supabase.from('visits').select('*'),
    ]);

    if (patientsResult.error) {
      toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: patientsResult.error.message });
    } else {
      setPatients(patientsResult.data as Patient[]);
    }

    if (paymentsResult.error) {
      if (isMissingPaidAmountColumnError(paymentsResult.error.message)) {
        setPatientPaidTotals({});
        setPatientPaymentDetails({});
      } else {
        toast({ variant: 'destructive', title: t('خطأ', 'Error'), description: paymentsResult.error.message });
      }
    } else {
      const totals: Record<string, number> = {};
      const details: Record<string, PatientPaymentDetail[]> = {};

      const paymentRows = (paymentsResult.data ?? []) as Array<{
        patient_id: string | null;
        paid_amount?: number | string | null;
        visit_date?: string | null;
        status?: string | null;
        chief_complaint?: string | null;
        diagnosis?: string | null;
      }>;

      for (const row of paymentRows) {
        if (!row.patient_id) continue;
        const paidAmount = Number(row.paid_amount) || 0;
        if (paidAmount <= 0) continue;

        totals[row.patient_id] = (totals[row.patient_id] ?? 0) + paidAmount;
        details[row.patient_id] = details[row.patient_id] ?? [];
        details[row.patient_id].push({
          visit_date: row.visit_date || new Date().toISOString(),
          paid_amount: paidAmount,
          status: row.status ?? null,
          chief_complaint: row.chief_complaint ?? null,
          diagnosis: row.diagnosis ?? null,
        });
      }

      for (const patientId of Object.keys(details)) {
        details[patientId].sort(
          (a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime(),
        );
      }

      setPatientPaidTotals(totals);
      setPatientPaymentDetails(details);
    }
    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const patientData = {
      ...formData,
      gender: formData.gender || null,
      spo2: formData.spo2 === '' ? null : Number(formData.spo2),
      created_by: user?.id,
    };

    let error;
    if (editingPatient) {
      const { error: updateError } = await supabase
        .from('patients')
        .update(patientData)
        .eq('id', editingPatient.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from('patients')
        .insert([patientData]);
      error = insertError;
    }

    if (error) {
      toast({ variant: 'destructive', title: t('Ø®Ø·Ø£', 'Error'), description: error.message });
    } else {
      toast({ title: t('ØªÙ… Ø¨Ù†Ø¬Ø§Ø­', 'Success'), description: editingPatient ? t('ØªÙ… ØªØ­Ø¯ÙŠØ« Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø±ÙŠØ¶ Ø¨Ù†Ø¬Ø§Ø­', 'Patient updated successfully') : t('ØªÙ… Ø¥Ø¶Ø§ÙØ© Ø§Ù„Ù…Ø±ÙŠØ¶ Ø¨Ù†Ø¬Ø§Ø­', 'Patient created successfully') });
      resetForm();
      setIsDialogOpen(false);
      fetchPatients();
    }
    setIsSaving(false);
  };

  const handleEdit = (patient: Patient) => {
    setEditingPatient(patient);
    setFormData({
      first_name: patient.first_name,
      last_name: patient.last_name,
      date_of_birth: patient.date_of_birth || '',
      gender: patient.gender || '',
      phone: patient.phone || '',
      email: patient.email || '',
      address: patient.address || '',
      blood_type: patient.blood_type || '',
      spo2: patient.spo2?.toString() || '',
      allergies: patient.allergies || '',
      notes: patient.notes || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† Ø­Ø°Ù Ù‡Ø°Ø§ Ø§Ù„Ù…Ø±ÙŠØ¶ØŸ', 'Are you sure you want to delete this patient?'))) return;

    const { error } = await supabase.from('patients').delete().eq('id', id);
    if (error) {
      toast({ variant: 'destructive', title: t('Ø®Ø·Ø£', 'Error'), description: error.message });
    } else {
      toast({ title: t('ØªÙ… Ø¨Ù†Ø¬Ø§Ø­', 'Success'), description: t('ØªÙ… Ø­Ø°Ù Ø§Ù„Ù…Ø±ÙŠØ¶ Ø¨Ù†Ø¬Ø§Ø­', 'Patient deleted successfully') });
      fetchPatients();
    }
  };

  const resetForm = () => {
    setEditingPatient(null);
    setFormData({
      first_name: '',
      last_name: '',
      date_of_birth: '',
      gender: '',
      phone: '',
      email: '',
      address: '',
      blood_type: '',
      spo2: '',
      allergies: '',
      notes: '',
    });
  };

  const filteredPatients = patients.filter(
    (p) =>
      p.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.phone?.includes(searchQuery) ||
      p.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const calculatedAge = useMemo(() => calculateAge(formData.date_of_birth), [formData.date_of_birth]);
  const getGenderLabel = (gender: Patient['gender']) => {
    if (gender === 'male') return t('Ø°ÙƒØ±', 'Male');
    if (gender === 'female') return t('Ø£Ù†Ø«Ù‰', 'Female');
    if (gender === 'other') return t('Ø¢Ø®Ø±', 'Other');
    return '-';
  };

  const getVisitStatusLabel = (status?: string | null) => {
    if (status === 'completed') return t('مكتملة', 'Completed');
    if (status === 'cancelled') return t('ملغاة', 'Cancelled');
    if (status === 'in_progress') return t('قيد التنفيذ', 'In Progress');
    if (status === 'pending') return t('قيد الانتظار', 'Pending');
    return '-';
  };

  const handlePrintPatient = (patient: Patient) => {
    const age = calculateAge(patient.date_of_birth);
    const paymentRows = (patientPaymentDetails[patient.id] ?? []).map((payment, index) => ({
      label: `${t('دفعة', 'Payment')} ${index + 1}`,
      value: [
        `${t('التاريخ', 'Date')}: ${new Date(payment.visit_date).toLocaleString()}`,
        `${t('المبلغ', 'Amount')}: ${currencyFormatter.format(payment.paid_amount)}`,
        `${t('الحالة', 'Status')}: ${getVisitStatusLabel(payment.status)}`,
        payment.chief_complaint
          ? `${t('الشكوى', 'Chief complaint')}: ${payment.chief_complaint}`
          : payment.diagnosis
            ? `${t('التشخيص', 'Diagnosis')}: ${payment.diagnosis}`
            : '',
      ]
        .filter(Boolean)
        .join(' | '),
    }));

    printStructuredReport({
      reportTitle: 'medical report',
      reportSubTitle: `${patient.first_name} ${patient.last_name}`,
      rows: [
        { label: t('الاسم', 'Name'), value: `${patient.first_name} ${patient.last_name}` },
        { label: t('الجنس', 'Gender'), value: getGenderLabel(patient.gender) },
        { label: t('تاريخ الميلاد', 'Date of Birth'), value: patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString() : '-' },
        { label: t('العمر', 'Age'), value: age !== null && age !== undefined ? String(age) : '-' },
        { label: t('الهاتف', 'Phone'), value: patient.phone || '-' },
        { label: t('البريد الإلكتروني', 'Email'), value: patient.email || '-' },
        { label: t('فصيلة الدم', 'Blood Type'), value: patient.blood_type || '-' },
        { label: 'SpO2', value: patient.spo2 !== null && patient.spo2 !== undefined ? `${patient.spo2}%` : '-' },
        { label: t('إجمالي المدفوع', 'Total Paid'), value: currencyFormatter.format(patientPaidTotals[patient.id] ?? 0) },
        { label: t('العنوان', 'Address'), value: patient.address || '-' },
      ],
      sections: [
        {
          title: t('ملاحظات طبية', 'Medical Notes'),
          rows: [
            { label: t('الحساسية', 'Allergies'), value: patient.allergies || '-' },
            { label: t('ملاحظات', 'Notes'), value: patient.notes || '-' },
          ],
        },
        {
          title: t('تفاصيل المدفوعات', 'Payment Details'),
          rows:
            paymentRows.length > 0
              ? paymentRows
              : [{ label: '-', value: t('لا توجد مدفوعات مسجلة لهذا المريض', 'No payments recorded for this patient') }],
        },
      ],
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('Ø§Ù„Ù…Ø±Ø¶Ù‰', 'Patients')}
        subtitle={t('Ø¥Ø¯Ø§Ø±Ø© Ù…Ù„ÙØ§Øª Ø§Ù„Ù…Ø±Ø¶Ù‰ ÙˆØ¨ÙŠØ§Ù†Ø§ØªÙ‡Ù…', 'Manage patient records and information')}
        action={
          <div className="flex items-center gap-2 no-print">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="ml-2 h-4 w-4" />
              {t('Ø·Ø¨Ø§Ø¹Ø© Ø§Ù„ØªÙ‚Ø±ÙŠØ±', 'Print Report')}
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
                    {t('Ø¥Ø¶Ø§ÙØ© Ù…Ø±ÙŠØ¶', 'Add Patient')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editingPatient ? t('ØªØ¹Ø¯ÙŠÙ„ Ù…Ø±ÙŠØ¶', 'Edit Patient') : t('Ø¥Ø¶Ø§ÙØ© Ù…Ø±ÙŠØ¶ Ø¬Ø¯ÙŠØ¯', 'New Patient')}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="first_name">{t('Ø§Ù„Ø§Ø³Ù… Ø§Ù„Ø£ÙˆÙ„ *', 'First Name *')}</Label>
                      <Input
                        id="first_name"
                        value={formData.first_name}
                        onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last_name">{t('Ø§Ø³Ù… Ø§Ù„Ø¹Ø§Ø¦Ù„Ø© *', 'Last Name *')}</Label>
                      <Input
                        id="last_name"
                        value={formData.last_name}
                        onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="date_of_birth">{t('ØªØ§Ø±ÙŠØ® Ø§Ù„Ù…ÙŠÙ„Ø§Ø¯', 'Date of Birth')}</Label>
                      <Input
                        id="date_of_birth"
                        type="date"
                        value={formData.date_of_birth}
                        onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="age_preview">{t('Ø§Ù„Ø¹Ù…Ø± (ØªÙ„Ù‚Ø§Ø¦ÙŠ)', 'Age (Auto)')}</Label>
                      <Input id="age_preview" value={calculatedAge ?? ''} disabled placeholder={t('ÙŠÙØ­Ø³Ø¨ ØªÙ„Ù‚Ø§Ø¦ÙŠÙ‹Ø§', 'Auto-calculated')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gender">{t('Ø§Ù„Ø¬Ù†Ø³', 'Gender')}</Label>
                      <Select
                        value={formData.gender}
                        onValueChange={(value: 'male' | 'female' | 'other') =>
                          setFormData({ ...formData, gender: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('Ø§Ø®ØªØ± Ø§Ù„Ø¬Ù†Ø³', 'Select gender')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="male">{t('Ø°ÙƒØ±', 'Male')}</SelectItem>
                          <SelectItem value="female">{t('Ø£Ù†Ø«Ù‰', 'Female')}</SelectItem>
                          <SelectItem value="other">{t('Ø¢Ø®Ø±', 'Other')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="phone">{t('Ø§Ù„Ù‡Ø§ØªÙ', 'Phone')}</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">{t('Ø§Ù„Ø¨Ø±ÙŠØ¯ Ø§Ù„Ø¥Ù„ÙƒØªØ±ÙˆÙ†ÙŠ', 'Email')}</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">{t('Ø§Ù„Ø¹Ù†ÙˆØ§Ù†', 'Address')}</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="blood_type">{t('ÙØµÙŠÙ„Ø© Ø§Ù„Ø¯Ù…', 'Blood Type')}</Label>
                      <Select
                        value={formData.blood_type}
                        onValueChange={(value) => setFormData({ ...formData, blood_type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('Ø§Ø®ØªØ± ÙØµÙŠÙ„Ø© Ø§Ù„Ø¯Ù…', 'Select blood type')} />
                        </SelectTrigger>
                        <SelectContent>
                          {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="spo2">SpO2 (%)</Label>
                      <Input
                        id="spo2"
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={formData.spo2}
                        onChange={(e) => setFormData({ ...formData, spo2: e.target.value })}
                        placeholder={t('Ù…Ø«Ø§Ù„: 98', 'e.g., 98')}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="allergies">{t('Ø§Ù„Ø­Ø³Ø§Ø³ÙŠØ©', 'Allergies')}</Label>
                    <Textarea
                      id="allergies"
                      value={formData.allergies}
                      onChange={(e) => setFormData({ ...formData, allergies: e.target.value })}
                      placeholder={t('Ø§Ù„Ø­Ø³Ø§Ø³ÙŠØ§Øª Ø§Ù„Ù…Ø¹Ø±ÙˆÙØ©...', 'Known allergies...')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="notes">{t('Ù…Ù„Ø§Ø­Ø¸Ø§Øª', 'Notes')}</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      placeholder={t('Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø¥Ø¶Ø§ÙÙŠØ©...', 'Additional notes...')}
                    />
                  </div>
                    <div className="flex justify-end gap-3">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                        {t('Ø¥Ù„ØºØ§Ø¡', 'Cancel')}
                      </Button>
                      <Button type="submit" disabled={isSaving}>
                        {isSaving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                        {editingPatient ? t('ØªØ­Ø¯ÙŠØ«', 'Update') : t('Ø¥Ø¶Ø§ÙØ©', 'Create')}
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
          placeholder={t('Ø§Ø¨Ø­Ø« Ø¹Ù† Ù…Ø±ÙŠØ¶...', 'Search patients...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pr-9"
        />
      </div>

      <div className="table-container">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Ø§Ù„Ø§Ø³Ù…', 'Name')}</TableHead>
              <TableHead>{t('Ø§Ù„ØªÙˆØ§ØµÙ„', 'Contact')}</TableHead>
              <TableHead>{t('Ø§Ù„Ø¬Ù†Ø³', 'Gender')}</TableHead>
              <TableHead>{t('ÙØµÙŠÙ„Ø© Ø§Ù„Ø¯Ù…', 'Blood Type')}</TableHead>
              <TableHead>SpO2</TableHead>
              <TableHead>{t('ØªØ§Ø±ÙŠØ® Ø§Ù„Ù…ÙŠÙ„Ø§Ø¯', 'Date of Birth')}</TableHead>
              <TableHead>{t('Ø§Ù„Ø¹Ù…Ø±', 'Age')}</TableHead>
              <TableHead className="text-right">{t('Ø§Ù„Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredPatients.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  {t('Ù„Ø§ ÙŠÙˆØ¬Ø¯ Ù…Ø±Ø¶Ù‰', 'No patients found')}
                </TableCell>
              </TableRow>
            ) : (
              filteredPatients.map((patient) => (
                <TableRow key={patient.id}>
                  <TableCell className="font-medium">
                    <Link
                      to={`/patients/${patient.id}`}
                      className="font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
                    >
                      {patient.first_name} {patient.last_name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      {patient.phone && <div>{patient.phone}</div>}
                      {patient.email && <div className="text-muted-foreground">{patient.email}</div>}
                    </div>
                  </TableCell>
                  <TableCell>{getGenderLabel(patient.gender)}</TableCell>
                  <TableCell>{patient.blood_type || '-'}</TableCell>
                  <TableCell>{patient.spo2 !== null && patient.spo2 !== undefined ? `${patient.spo2}%` : '-'}</TableCell>
                  <TableCell>
                    {patient.date_of_birth
                      ? new Date(patient.date_of_birth).toLocaleDateString()
                      : '-'}
                  </TableCell>
                  <TableCell>{calculateAge(patient.date_of_birth) ?? '-'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2 no-print">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handlePrintPatient(patient)}
                        title={t('طباعة تقرير المريض', 'Print patient report')}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                      {hasRole(['admin', 'doctor', 'receptionist']) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(patient)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                      {hasRole(['admin']) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(patient.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
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
    </div>
  );
}

