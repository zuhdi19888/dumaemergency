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
  DialogDescription,
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
import { Plus, Search, Loader2, CheckCircle, Eye, Pill, Printer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Prescription, Visit, Medicine, PrescriptionItem } from '@/types/clinic';
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

const isMissingPrescriptionPaidAmountColumnError = (message: string) =>
  /paid_amount/i.test(message) &&
  (/could not find/i.test(message) || /does not exist/i.test(message) || /column/i.test(message) || /schema cache/i.test(message));

const isMissingPaidCollectorColumnsError = (message: string) =>
  /(paid_collected_by|paid_collected_at)/i.test(message) &&
  (/does not exist/i.test(message) || /column/i.test(message) || /schema cache/i.test(message));

const isMissingExternalPurchaseColumnsError = (message: string) =>
  /(external_medicine_name|is_external_purchase)/i.test(message) &&
  (/could not find/i.test(message) || /does not exist/i.test(message) || /column/i.test(message) || /schema cache/i.test(message));

type VisitLookupRow = {
  id: string;
  visit_date: string;
  patient_id: string | null;
  notes?: string | null;
  paid_amount?: number | string | null;
};

const hasPaidAmountColumn = (row: Record<string, unknown>) =>
  Object.prototype.hasOwnProperty.call(row, 'paid_amount');

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

type PatientLookupRow = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
};

type ProfileLookup = {
  id: string;
  full_name: string | null;
  email: string;
};

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

type PrescriptionFormItem = {
  medicine_id: string;
  is_external_purchase: boolean;
  external_medicine_name: string;
  quantity: number;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
};

const EXTERNAL_PURCHASE_VALUE = '__external_purchase__';

const createEmptyPrescriptionItem = (): PrescriptionFormItem => ({
  medicine_id: '',
  is_external_purchase: false,
  external_medicine_name: '',
  quantity: 1,
  dosage: '',
  frequency: '',
  duration: '',
  instructions: '',
});

export default function Prescriptions() {
  const { user, profile, hasRole } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPaidAmountColumnAvailable, setIsPaidAmountColumnAvailable] = useState(true);
  const [viewingPrescription, setViewingPrescription] = useState<Prescription | null>(null);
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionItem[]>([]);
  const [prescriptionAuditLogs, setPrescriptionAuditLogs] = useState<AuditLogEntry[]>([]);

  const [formData, setFormData] = useState({
    visit_id: '',
    paid_amount: '0',
    notes: '',
    items: [createEmptyPrescriptionItem()],
  });

  useEffect(() => {
    void fetchPrescriptions();
    void fetchVisits();
    void fetchMedicines();
  }, []);

  const applyPaidAmountAvailability = (available: boolean) => {
    setIsPaidAmountColumnAvailable(available);
  };

  const fetchPatientsMap = async (patientIds: string[]) => {
    const uniqueIds = Array.from(new Set(patientIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return {} as Record<string, { first_name: string; last_name: string; date_of_birth: string | null }>;
    }

    const { data, error } = await supabase
      .from('patients')
      .select('id, first_name, last_name, date_of_birth')
      .in('id', uniqueIds);

    if (error) {
      toast({ variant: 'destructive', title: t('Error', 'Error'), description: error.message });
      return {} as Record<string, { first_name: string; last_name: string; date_of_birth: string | null }>;
    }

    return ((data ?? []) as PatientLookupRow[]).reduce<Record<string, { first_name: string; last_name: string; date_of_birth: string | null }>>(
      (acc, patient) => {
        acc[patient.id] = {
          first_name: patient.first_name,
          last_name: patient.last_name,
          date_of_birth: patient.date_of_birth,
        };
        return acc;
      },
      {},
    );
  };

  const fetchVisitRowsByIds = async (visitIds: string[]) => {
    const uniqueIds = Array.from(new Set(visitIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return { rows: [] as VisitLookupRow[], paidAmountAvailable: isPaidAmountColumnAvailable };
    }

    const idChunks = chunkArray(uniqueIds, 25);
    const rows: VisitLookupRow[] = [];

    for (const idsChunk of idChunks) {
      const result = await supabase
        .from('visits')
        .select('*')
        .in('id', idsChunk);

      if (result.error) {
        return {
          rows: [] as VisitLookupRow[],
          paidAmountAvailable: isPaidAmountColumnAvailable,
          errorMessage: result.error.message,
        };
      }

      rows.push(...((result.data ?? []) as VisitLookupRow[]));
    }

    const paidAmountAvailable = rows.length === 0
      ? isPaidAmountColumnAvailable
      : rows.some((row) => hasPaidAmountColumn(row as unknown as Record<string, unknown>));

    return { rows, paidAmountAvailable };
  };

  const fetchCompletedVisitRows = async () => {
    const result = await supabase
      .from('visits')
      .select('*')
      .eq('status', 'completed')
      .order('visit_date', { ascending: false });

    if (result.error) {
      return {
        rows: [] as VisitLookupRow[],
        paidAmountAvailable: isPaidAmountColumnAvailable,
        errorMessage: result.error.message,
      };
    }

    const rows = (result.data ?? []) as VisitLookupRow[];
    const paidAmountAvailable = rows.length === 0
      ? isPaidAmountColumnAvailable
      : rows.some((row) => hasPaidAmountColumn(row as unknown as Record<string, unknown>));

    return { rows, paidAmountAvailable };
  };

  const fetchPrescriptions = async () => {
    setIsLoading(true);

    const prescriptionsResult = await supabase
      .from('prescriptions')
      .select('*')
      .order('prescription_date', { ascending: false });

    if (prescriptionsResult.error) {
      toast({
        variant: 'destructive',
        title: t('Error', 'Error'),
        description: prescriptionsResult.error.message,
      });
      setIsLoading(false);
      return;
    }

    const basePrescriptions = (prescriptionsResult.data ?? []) as Prescription[];
    if (basePrescriptions.length === 0) {
      setPrescriptions([]);
      setIsLoading(false);
      return;
    }

    const visitIds = basePrescriptions.map((prescription) => prescription.visit_id);
    const visitRowsResult = await fetchVisitRowsByIds(visitIds);

    if (visitRowsResult.errorMessage) {
      toast({
        variant: 'destructive',
        title: t('Error', 'Error'),
        description: visitRowsResult.errorMessage,
      });
      setPrescriptions(basePrescriptions);
      setIsLoading(false);
      return;
    }

    applyPaidAmountAvailability(visitRowsResult.paidAmountAvailable);

    const patientIds = visitRowsResult.rows
      .map((visit) => visit.patient_id ?? '')
      .filter(Boolean);
    const patientsMap = await fetchPatientsMap(patientIds);

    const visitsMap = visitRowsResult.rows.reduce<Record<string, any>>((acc, visit) => {
      acc[visit.id] = {
        ...visit,
        paid_amount: visitRowsResult.paidAmountAvailable
          ? Number(visit.paid_amount) || 0
          : parsePaidAmountFromNotes(visit.notes),
        patient: visit.patient_id ? patientsMap[visit.patient_id] : undefined,
      };
      return acc;
    }, {});

    const normalizedPrescriptions = basePrescriptions.map((prescription) => ({
      ...prescription,
      visit: visitsMap[prescription.visit_id],
    }));

    setPrescriptions(normalizedPrescriptions as Prescription[]);
    setIsLoading(false);
  };

  const fetchVisits = async () => {
    const visitsResult = await fetchCompletedVisitRows();

    if (visitsResult.errorMessage) {
      toast({
        variant: 'destructive',
        title: t('Error', 'Error'),
        description: visitsResult.errorMessage,
      });
      return;
    }

    applyPaidAmountAvailability(visitsResult.paidAmountAvailable);

    const patientIds = visitsResult.rows
      .map((visit) => visit.patient_id ?? '')
      .filter(Boolean);
    const patientsMap = await fetchPatientsMap(patientIds);

    const normalizedVisits = visitsResult.rows.map((visit) => ({
      ...visit,
      paid_amount: visitsResult.paidAmountAvailable
        ? Number(visit.paid_amount) || 0
        : parsePaidAmountFromNotes(visit.notes),
      patient: visit.patient_id ? patientsMap[visit.patient_id] : undefined,
    }));

    setVisits(normalizedVisits as Visit[]);
  };

  const fetchMedicines = async () => {
    const { data } = await supabase
      .from('medicines')
      .select('*')
      .order('name');
    if (data) setMedicines(data as Medicine[]);
  };

  const fetchPrescriptionItems = async (prescriptionId: string) => {
    const { data } = await supabase
      .from('prescription_items')
      .select(`
        *,
        medicine:medicines(id, name, unit)
      `)
      .eq('prescription_id', prescriptionId);
    if (data) setPrescriptionItems(data as PrescriptionItem[]);
  };

  const fetchPrescriptionAuditLogs = async (prescriptionId: string) => {
    const logsRes = await (supabase as any)
      .from('audit_logs')
      .select('*')
      .eq('entity_type', 'prescription')
      .eq('entity_id', prescriptionId)
      .order('changed_at', { ascending: false });

    if (logsRes.error) {
      toast({ variant: 'destructive', title: t('Error', 'Error'), description: logsRes.error.message });
      setPrescriptionAuditLogs([]);
      return;
    }

    const logs = (logsRes.data ?? []) as AuditLogEntry[];
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

    setPrescriptionAuditLogs(
      logs.map((log) => ({
        ...log,
        actor: log.changed_by ? actorMap[log.changed_by] ?? null : null,
      })),
    );
  };

  const savePaidAmountInVisitNotesFallback = async (visitId: string, paidAmount: number) => {
    if ((Number(paidAmount) || 0) <= 0) return null;

    const visitResult = await supabase
      .from('visits')
      .select('notes')
      .eq('id', visitId)
      .single();

    if (visitResult.error) {
      return visitResult.error.message;
    }

    const updatedNotes = withPaidAmountInNotesFallback(
      (visitResult.data as { notes?: string | null } | null)?.notes,
      paidAmount,
    );

    const updateResult = await supabase
      .from('visits')
      .update({ notes: updatedNotes })
      .eq('id', visitId);

    if (updateResult.error) {
      return updateResult.error.message;
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    const normalizedPaidAmount = hasRole(['admin', 'doctor'])
      ? Math.max(0, Number(formData.paid_amount) || 0)
      : 0;

    let prescriptionInsertResult = await supabase
      .from('prescriptions')
      .insert([{
        visit_id: formData.visit_id,
        notes: formData.notes,
        doctor_id: user?.id,
        paid_amount: normalizedPaidAmount,
      }])
      .select()
      .single();

    if (prescriptionInsertResult.error && isMissingPrescriptionPaidAmountColumnError(prescriptionInsertResult.error.message)) {
      prescriptionInsertResult = await supabase
        .from('prescriptions')
        .insert([{
          visit_id: formData.visit_id,
          notes: formData.notes,
          doctor_id: user?.id,
        }])
        .select()
        .single();
    }

    const { data: prescription, error: prescriptionError } = prescriptionInsertResult;

    if (prescriptionError || !prescription) {
      toast({
        variant: 'destructive',
        title: t('Error', 'Error'),
        description: prescriptionError?.message || t('Unable to save prescription.', 'Unable to save prescription.'),
      });
      setIsSaving(false);
      return;
    }

    let hasMissingExternalMedicineName = false;
    const hasExternalPurchaseItems = formData.items.some((item) => item.is_external_purchase);
    const items = formData.items.flatMap((item) => {
      const externalMedicineName = item.external_medicine_name.trim();
      if (item.is_external_purchase) {
        if (!externalMedicineName) {
          hasMissingExternalMedicineName = true;
          return [];
        }
        return [{
          prescription_id: prescription.id,
          medicine_id: null,
          is_external_purchase: true,
          external_medicine_name: externalMedicineName,
          quantity: item.quantity,
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
          instructions: item.instructions,
        }];
      }

      if (!item.medicine_id) {
        return [];
      }

      return [{
        prescription_id: prescription.id,
        medicine_id: item.medicine_id,
        quantity: item.quantity,
        dosage: item.dosage,
        frequency: item.frequency,
        duration: item.duration,
        instructions: item.instructions,
      }];
    });

    if (hasMissingExternalMedicineName) {
      toast({
        variant: 'destructive',
        title: t('Error', 'Error'),
        description: t(
          'ÙŠØ±Ø¬Ù‰ Ø¥Ø¯Ø®Ø§Ù„ Ø§Ø³Ù… Ø§Ù„Ø¯ÙˆØ§Ø¡ Ø§Ù„Ù…Ø±Ø§Ø¯ Ø´Ø±Ø§Ø¤Ù‡ Ù…Ù† Ø§Ù„Ø®Ø§Ø±Ø¬.',
          'Please enter the external medicine name.',
        ),
      });
      setIsSaving(false);
      return;
    }

    if (items.length > 0) {
      const { error: itemsError } = await supabase
        .from('prescription_items')
        .insert(items);

      if (itemsError) {
        if (isMissingExternalPurchaseColumnsError(itemsError.message)) {
          const legacyItems = (items as any[])
            .filter((item) => item.medicine_id)
            .map((item) => ({
              prescription_id: item.prescription_id,
              medicine_id: item.medicine_id,
              quantity: item.quantity,
              dosage: item.dosage,
              frequency: item.frequency,
              duration: item.duration,
              instructions: item.instructions,
            }));

          if (legacyItems.length > 0) {
            const { error: legacyItemsError } = await supabase
              .from('prescription_items')
              .insert(legacyItems);

            if (!legacyItemsError) {
              // Successfully saved on legacy schema (without external purchase columns)
            } else {
              toast({
                variant: 'destructive',
                title: t('Error', 'Error'),
                description: legacyItemsError.message,
              });
              setIsSaving(false);
              return;
            }
          } else {
            if (hasExternalPurchaseItems) {
              toast({
                variant: 'destructive',
                title: t('Error', 'Error'),
                description: t(
                  'لا يمكن حفظ دواء خارجي قبل تطبيق ترحيل قاعدة البيانات لحقل external_medicine_name.',
                  'Cannot save external purchase medicines until external_medicine_name migration is applied.',
                ),
              });
            } else {
              toast({
                variant: 'destructive',
                title: t('Error', 'Error'),
                description: t(
                  'حدث تعارض في بنية جدول prescription_items. يرجى تحديث قاعدة البيانات.',
                  'prescription_items schema mismatch. Please update database migrations.',
                ),
              });
            }
            setIsSaving(false);
            return;
          }
        } else {
          toast({ variant: 'destructive', title: t('Error', 'Error'), description: itemsError.message });
          setIsSaving(false);
          return;
        }
      }
    }

    let paymentSavedWithNotesFallback = false;
    let paidAmountWarningMessage: string | null = null;

    if (isPaidAmountColumnAvailable) {
      const paymentUpdatePayload: Record<string, unknown> = { paid_amount: normalizedPaidAmount };
      if (normalizedPaidAmount > 0) {
        paymentUpdatePayload.paid_collected_by = user?.id ?? null;
        paymentUpdatePayload.paid_collected_at = new Date().toISOString();
      }

      let { error: visitPaymentError } = await supabase
        .from('visits')
        .update(paymentUpdatePayload)
        .eq('id', formData.visit_id);

      if (visitPaymentError && isMissingPaidCollectorColumnsError(visitPaymentError.message)) {
        const retryResult = await supabase
          .from('visits')
          .update({ paid_amount: normalizedPaidAmount })
          .eq('id', formData.visit_id);
        visitPaymentError = retryResult.error;
      }

      if (visitPaymentError && isMissingPaidAmountColumnError(visitPaymentError.message)) {
        setIsPaidAmountColumnAvailable(false);
        const fallbackError = await savePaidAmountInVisitNotesFallback(formData.visit_id, normalizedPaidAmount);
        if (fallbackError) {
          paidAmountWarningMessage = fallbackError;
        } else {
          paymentSavedWithNotesFallback = normalizedPaidAmount > 0;
        }
      } else if (visitPaymentError) {
        paidAmountWarningMessage = visitPaymentError.message;
      }
    } else {
      const fallbackError = await savePaidAmountInVisitNotesFallback(formData.visit_id, normalizedPaidAmount);
      if (fallbackError) {
        paidAmountWarningMessage = fallbackError;
      } else {
        paymentSavedWithNotesFallback = normalizedPaidAmount > 0;
      }
    }

    if (paidAmountWarningMessage) {
      toast({
        variant: 'destructive',
        title: t('Warning', 'Warning'),
        description: `${t(
          'Prescription saved, but paid amount was not saved:',
          'Prescription saved, but paid amount was not saved:',
        )} ${paidAmountWarningMessage}`,
      });
    } else if (paymentSavedWithNotesFallback) {
      toast({
        title: t('Success', 'Success'),
        description: t(
          'Prescription created and paid amount was saved in visit notes fallback.',
          'Prescription created and paid amount was saved in visit notes fallback.',
        ),
      });
    } else {
      toast({
        title: t('Success', 'Success'),
        description:
          normalizedPaidAmount > 0
            ? t(
                'Prescription created and paid amount saved successfully',
                'Prescription created and paid amount saved successfully',
              )
            : t('Prescription created successfully', 'Prescription created successfully'),
      });
    }

    resetForm();
    setIsDialogOpen(false);
    void fetchPrescriptions();
    void fetchVisits();
    setIsSaving(false);
  };

  const handleDispense = async (prescriptionId: string) => {
    const { error } = await supabase.rpc('dispense_prescription', {
      _prescription_id: prescriptionId,
    });

    if (error) {
      toast({ variant: 'destructive', title: t('Error', 'Error'), description: error.message });
    } else {
      toast({
        title: t('Success', 'Success'),
        description: t('Prescription dispensed and stock updated', 'Prescription dispensed and stock updated'),
      });
      void fetchPrescriptions();
    }
  };

  const handleViewPrescription = async (prescription: Prescription) => {
    setViewingPrescription(prescription);
    await Promise.all([
      fetchPrescriptionItems(prescription.id),
      fetchPrescriptionAuditLogs(prescription.id),
    ]);
  };

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, createEmptyPrescriptionItem()],
    }));
  };

  const removeItem = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index),
    }));
  };

  const updateItem = (index: number, field: string, value: string | number) => {
    setFormData((prev) => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, items: newItems };
    });
  };

  const updateItemMedicineSelection = (index: number, value: string) => {
    setFormData((prev) => {
      const newItems = [...prev.items];
      if (value === EXTERNAL_PURCHASE_VALUE) {
        newItems[index] = {
          ...newItems[index],
          medicine_id: '',
          is_external_purchase: true,
        };
      } else {
        newItems[index] = {
          ...newItems[index],
          medicine_id: value,
          is_external_purchase: false,
          external_medicine_name: '',
        };
      }
      return { ...prev, items: newItems };
    });
  };

  const resetForm = () => {
    setFormData({
      visit_id: '',
      paid_amount: '0',
      notes: '',
      items: [createEmptyPrescriptionItem()],
    });
  };

  const filteredPrescriptions = prescriptions.filter((prescription) => {
    const patientName = `${(prescription as any).visit?.patient?.first_name ?? ''} ${(prescription as any).visit?.patient?.last_name ?? ''}`.toLowerCase();
    return patientName.includes(searchQuery.toLowerCase()) || prescription.status.includes(searchQuery.toLowerCase());
  });

  const getStatusLabel = (status: Prescription['status']) => {
    if (status === 'dispensed') return t('Dispensed', 'Dispensed');
    if (status === 'cancelled') return t('Cancelled', 'Cancelled');
    return t('Pending', 'Pending');
  };

  const getPrescriptionPaidAmount = (prescription: Prescription) => {
    const directAmount = Number((prescription as any).paid_amount);
    if (Number.isFinite(directAmount) && directAmount >= 0) return directAmount;
    return Number((prescription as any).visit?.paid_amount) || 0;
  };

  const handlePrintPrescription = async (prescription: Prescription) => {
    const patientName = `${(prescription as any).visit?.patient?.first_name ?? ''} ${(prescription as any).visit?.patient?.last_name ?? ''}`.trim() || '-';
    const patientDob = (prescription as any).visit?.patient?.date_of_birth as string | null | undefined;
    const patientAge = calculateAge(patientDob);
    const printedByDoctorName =
      profile?.full_name ||
      (typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '') ||
      user?.email ||
      t('ØºÙŠØ± Ù…Ø¹Ø±ÙˆÙ', 'Unknown');

    let itemsSectionRows: { label: string; value: string }[] = [];

    const itemsRes = await supabase
      .from('prescription_items')
      .select(`
        *,
        medicine:medicines(name, unit)
      `)
      .eq('prescription_id', prescription.id);

    if (itemsRes.error) {
      toast({ variant: 'destructive', title: t('Error', 'Error'), description: itemsRes.error.message });
    } else {
      itemsSectionRows = ((itemsRes.data ?? []) as any[]).map((item, index) => ({
        label: `${t('Medicine', 'Medicine')} ${index + 1}`,
        value: [
          `${item.medicine?.name ?? item.external_medicine_name ?? '-'}`,
          `${t('Source', 'Source')}: ${item.is_external_purchase ? t('Ø´Ø±Ø§Ø¡ Ø®Ø§Ø±Ø¬ÙŠ', 'External purchase') : t('Ù…Ù† Ø§Ù„Ù…Ø®Ø²ÙˆÙ†', 'From stock')}`,
          `${t('Qty', 'Qty')}: ${item.quantity ?? '-'}`,
          item.dosage ? `${t('Dosage', 'Dosage')}: ${item.dosage}` : '',
          item.frequency ? `${t('Frequency', 'Frequency')}: ${item.frequency}` : '',
          item.duration ? `${t('Duration', 'Duration')}: ${item.duration}` : '',
          item.instructions ? `${t('Instructions', 'Instructions')}: ${item.instructions}` : '',
        ].filter(Boolean).join(' | '),
      }));
    }

    printStructuredReport({
      reportTitle: 'medical report',
      reportSubTitle: patientName,
      doctorSignatureName: printedByDoctorName,
      rows: [
        { label: t('Patient', 'Patient'), value: patientName },
        { label: t('Date', 'Date'), value: new Date(prescription.prescription_date).toLocaleString() },
        {
          label: t('Date of Birth', 'Date of Birth'),
          value: patientDob ? new Date(patientDob).toLocaleDateString() : '-',
        },
        {
          label: t('Age', 'Age'),
          value: patientAge !== null && patientAge !== undefined ? String(patientAge) : '-',
        },
        { label: t('Status', 'Status'), value: getStatusLabel(prescription.status) },
        { label: t('Dispensed At', 'Dispensed At'), value: prescription.dispensed_at ? new Date(prescription.dispensed_at).toLocaleString() : '-' },
        { label: t('Paid', 'Paid'), value: currencyFormatter.format(getPrescriptionPaidAmount(prescription)) },
      ],
      sections: [
        {
          title: t('Medicines', 'Medicines'),
          rows: itemsSectionRows.length > 0 ? itemsSectionRows : [{ label: '-', value: t('No medicines found', 'No medicines found') }],
        },
        {
          title: t('Payment Details', 'Payment Details'),
          rows: [
            { label: t('Payment Type', 'Payment Type'), value: t('Patient visit payment', 'Patient visit payment') },
            { label: t('Paid', 'Paid'), value: currencyFormatter.format(getPrescriptionPaidAmount(prescription)) },
            { label: t('Payment Date', 'Payment Date'), value: new Date(prescription.prescription_date).toLocaleString() },
          ],
        },
        {
          title: t('Notes', 'Notes'),
          rows: [{ label: t('Notes', 'Notes'), value: prescription.notes || '-' }],
        },
      ],
    });
  };

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

  const getAuditActionLabel = (entry: AuditLogEntry) => {
    if (entry.action === 'insert') return t('Prescription Added', 'Prescription Added');
    if (entry.action === 'update') return t('Prescription Updated', 'Prescription Updated');
    if (entry.action === 'delete') return t('Prescription Deleted', 'Prescription Deleted');
    return t('Prescription Changed', 'Prescription Changed');
  };

  const getActorLabel = (entry: AuditLogEntry) =>
    entry.actor?.full_name || entry.actor?.email || entry.changed_by || t('System', 'System');

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title={t('Prescriptions', 'Prescriptions')}
        subtitle={t('Manage patient prescriptions and dispensing', 'Manage patient prescriptions and dispensing')}
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="ml-2 h-4 w-4" />
              {t('Print Report', 'Print Report')}
            </Button>
            {hasRole(['admin', 'doctor']) && (
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
                    {t('New Prescription', 'New Prescription')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{t('New Prescription', 'New Prescription')}</DialogTitle>
                    <DialogDescription>
                      {t(
                        'Create a new prescription and record the paid amount for the selected visit.',
                        'Create a new prescription and record the paid amount for the selected visit.',
                      )}
                    </DialogDescription>
                  </DialogHeader>

                  <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="visit_id">{t('Visit *', 'Visit *')}</Label>
                    <Select
                      value={formData.visit_id}
                      onValueChange={(value) => {
                        const selectedVisit = visits.find((visit) => visit.id === value) as any;
                        setFormData((prev) => ({
                          ...prev,
                          visit_id: value,
                          paid_amount: String(Number(selectedVisit?.paid_amount) || 0),
                        }));
                      }}
                      required
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('Select visit', 'Select visit')} />
                      </SelectTrigger>
                      <SelectContent>
                        {visits.map((visit: any) => (
                          <SelectItem key={visit.id} value={visit.id}>
                            {visit.patient?.first_name} {visit.patient?.last_name} - {new Date(visit.visit_date).toLocaleDateString()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>{t('Medicines', 'Medicines')}</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addItem}>
                        <Plus className="ml-1 h-3 w-3" />
                        {t('Add Medicine', 'Add Medicine')}
                      </Button>
                    </div>

                    {formData.items.map((item, index) => (
                      <div key={index} className="space-y-3 rounded-lg border border-border p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">
                            {t('Medicine', 'Medicine')} {index + 1}
                          </span>
                          {formData.items.length > 1 && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(index)}>
                              {t('Remove', 'Remove')}
                            </Button>
                          )}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <Select
                            value={item.is_external_purchase ? EXTERNAL_PURCHASE_VALUE : item.medicine_id}
                            onValueChange={(value) => updateItemMedicineSelection(index, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={t('Select medicine', 'Select medicine')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={EXTERNAL_PURCHASE_VALUE}>
                                {t(
                                  'Ø¯ÙˆØ§Ø¡ Ù„Ù„Ø´Ø±Ø§Ø¡ Ù…Ù† Ø§Ù„Ø®Ø§Ø±Ø¬ (ØºÙŠØ± Ù…ÙˆØ¬ÙˆØ¯ Ø¨Ø§Ù„Ù…Ø®Ø²ÙˆÙ†)',
                                  'External purchase medicine (not in stock)',
                                )}
                              </SelectItem>
                              {medicines.map((medicine) => (
                                <SelectItem key={medicine.id} value={medicine.id}>
                                  {medicine.name} ({t('in stock', 'in stock')}: {medicine.stock_quantity})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {item.is_external_purchase && (
                            <Input
                              className="sm:col-span-2"
                              placeholder={t(
                                'Ø§Ø³Ù… Ø§Ù„Ø¯ÙˆØ§Ø¡ Ø§Ù„Ù…Ø±Ø§Ø¯ Ø´Ø±Ø§Ø¤Ù‡ Ù…Ù† Ø§Ù„Ø®Ø§Ø±Ø¬',
                                'External medicine name',
                              )}
                              value={item.external_medicine_name}
                              onChange={(e) => updateItem(index, 'external_medicine_name', e.target.value)}
                            />
                          )}

                          <Input
                            type="number"
                            min="1"
                            placeholder={t('Quantity', 'Quantity')}
                            value={item.quantity}
                            onChange={(e) => updateItem(index, 'quantity', Number.parseInt(e.target.value, 10) || 1)}
                          />
                          <Input
                            placeholder={t('Dosage (e.g., 500mg)', 'Dosage (e.g., 500mg)')}
                            value={item.dosage}
                            onChange={(e) => updateItem(index, 'dosage', e.target.value)}
                          />
                          <Input
                            placeholder={t('Frequency (e.g., 3x daily)', 'Frequency (e.g., 3x daily)')}
                            value={item.frequency}
                            onChange={(e) => updateItem(index, 'frequency', e.target.value)}
                          />
                          <Input
                            placeholder={t('Duration (e.g., 7 days)', 'Duration (e.g., 7 days)')}
                            value={item.duration}
                            onChange={(e) => updateItem(index, 'duration', e.target.value)}
                          />
                          <Input
                            placeholder={t('Instructions', 'Instructions')}
                            value={item.instructions}
                            onChange={(e) => updateItem(index, 'instructions', e.target.value)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {hasRole(['admin', 'doctor']) && formData.visit_id && (
                    <div className="space-y-2">
                      <Label htmlFor="paid_amount">{t('Paid Amount', 'Paid Amount')}</Label>
                      <Input
                        id="paid_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.paid_amount}
                        onChange={(e) => setFormData((prev) => ({ ...prev, paid_amount: e.target.value }))}
                        placeholder="0.00"
                      />
                      <p className="text-xs text-muted-foreground">
                        {t(
                          'يتم حفظ هذا المبلغ في قاعدة البيانات ضمن الزيارة المحددة.',
                          'This amount is saved to the selected visit in the database.',
                        )}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="notes">{t('Notes', 'Notes')}</Label>
                    <Textarea
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                      placeholder={t('Additional notes...', 'Additional notes...')}
                    />
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      {t('Cancel', 'Cancel')}
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                      {isSaving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                      {t('Create Prescription', 'Create Prescription')}
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
          placeholder={t('Search prescriptions...', 'Search prescriptions...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pr-9"
        />
      </div>

      <div className="table-container">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Patient', 'Patient')}</TableHead>
              <TableHead>{t('Date', 'Date')}</TableHead>
              <TableHead>{t('Status', 'Status')}</TableHead>
              <TableHead>{t('Dispensed At', 'Dispensed At')}</TableHead>
              <TableHead>{t('Paid', 'Paid')}</TableHead>
              <TableHead className="text-right">{t('Actions', 'Actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredPrescriptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  {t('No prescriptions found', 'No prescriptions found')}
                </TableCell>
              </TableRow>
            ) : (
              filteredPrescriptions.map((prescription) => (
                <TableRow key={prescription.id}>
                  <TableCell className="font-medium">
                    {(prescription as any).visit?.patient?.first_name} {(prescription as any).visit?.patient?.last_name}
                  </TableCell>
                  <TableCell>{new Date(prescription.prescription_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <span className={`status-badge ${
                      prescription.status === 'dispensed' ? 'status-completed' :
                      prescription.status === 'cancelled' ? 'status-cancelled' :
                      'status-pending'
                    }`}>
                      {getStatusLabel(prescription.status)}
                    </span>
                  </TableCell>
                  <TableCell>
                    {prescription.dispensed_at
                      ? new Date(prescription.dispensed_at).toLocaleString()
                      : '-'}
                  </TableCell>
                  <TableCell>{currencyFormatter.format(getPrescriptionPaidAmount(prescription))}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => void handlePrintPrescription(prescription)}
                        title={t('Print Prescription', 'Print Prescription')}
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleViewPrescription(prescription)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {prescription.status === 'pending' && hasRole(['admin', 'pharmacist']) && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDispense(prescription.id)}
                          className="text-success hover:text-success"
                        >
                          <CheckCircle className="h-4 w-4" />
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

      <Dialog open={!!viewingPrescription} onOpenChange={() => {
        setViewingPrescription(null);
        setPrescriptionItems([]);
        setPrescriptionAuditLogs([]);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('Prescription Details', 'Prescription Details')}</DialogTitle>
            <DialogDescription>
              {t(
                'Review prescribed medicines and notes.',
                'Review prescribed medicines and notes.',
              )}
            </DialogDescription>
          </DialogHeader>
          {viewingPrescription && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">{t('Patient', 'Patient')}</p>
                  <p className="font-medium">
                    {(viewingPrescription as any).visit?.patient?.first_name} {(viewingPrescription as any).visit?.patient?.last_name}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('Date', 'Date')}</p>
                  <p className="font-medium">
                    {new Date(viewingPrescription.prescription_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm text-muted-foreground">{t('Medicines', 'Medicines')}</p>
                <div className="space-y-2">
                  {prescriptionItems.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                        <Pill className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">
                          {(item as any).medicine?.name ?? (item as any).external_medicine_name ?? '-'}
                        </p>
                        {(item as any).is_external_purchase && (
                          <p className="text-xs text-muted-foreground">
                            {t('Ø¯ÙˆØ§Ø¡ Ù„Ù„Ø´Ø±Ø§Ø¡ Ù…Ù† Ø§Ù„Ø®Ø§Ø±Ø¬', 'External purchase medicine')}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {t('Qty', 'Qty')}: {item.quantity} | {item.dosage} | {item.frequency} | {item.duration}
                        </p>
                        {item.instructions && (
                          <p className="text-sm text-muted-foreground">
                            {t('Instructions', 'Instructions')}: {item.instructions}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {viewingPrescription.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">{t('Notes', 'Notes')}</p>
                  <p className="font-medium">{viewingPrescription.notes}</p>
                </div>
              )}
              <div>
                <p className="mb-2 text-sm text-muted-foreground">{t('Activity Log', 'Activity Log')}</p>
                {prescriptionAuditLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('No audit activity yet', 'No audit activity yet')}</p>
                ) : (
                  <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-border p-3">
                    {prescriptionAuditLogs.map((entry) => (
                      <div key={entry.id} className="rounded-md border border-border p-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium">{getAuditActionLabel(entry)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(entry.changed_at).toLocaleString()}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t('By', 'By')}: {getActorLabel(entry)}
                        </p>
                        {entry.changed_fields?.length > 0 && (
                          <div className="mt-1 space-y-1">
                            {entry.changed_fields.slice(0, 6).map((field) => (
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
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

